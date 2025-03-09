import { Component, AfterViewInit, ViewChildren, QueryList, ElementRef, HostListener, ViewChild } from '@angular/core';

interface FieldDefinition {
    _id: string;
    type: 'String' | 'Number' | 'Boolean' | 'Object' | 'Array';
    nodeId: string;
    dataPath: string;
    dataPathSegs: string[];
    objDef?: any; // For Object types
    arrayItemType?: 'String' | 'Number' | 'Boolean' | 'Object' | 'Array'; // For Array types
    arrayItemDef?: FieldDefinition; // For Array of Objects
    arrayIndex?: number;  // Add this to track array indices
}

interface ArrayMapping {
    sourceId: string;
    targetId: string;
    index?: number;
    isForceMapping?: boolean;
    mappingType?: 'copy' | 'iterate';  // Add this field
}

type ValidationResult = {
    isValid;
    message?: string;
    requiresIndex?;
    requiresParentArrayMapping?;
    isTypeError?: boolean;
    requiresConfirmation?;
};

interface ConditionalBlock {
    type: 'if' | 'elseif' | 'else';
    value: string;  // The 'then' part
    condition?: string;  // Optional because 'else' doesn't have a condition
}

interface ConditionalConfig {
    conditions: ConditionalBlock[];
}

// Add this interface to store mapping type
interface TargetMappingState {
    isConditional;
}

interface MappingPayload {
    expression: {
        type: 'simple' | 'conditional';
        value: string;
        conditions?: ConditionalBlock[];
    };
    key: string;
    name: string;
    target: {
        _id: string;
        type: string;
        dataPath: string;
        dataPathSegs: string[];
        arrayIndex?: number;
        arrayItemType?: string;
    };
    children: MappingPayload[];
    sources: Array<{
        _id: string;
        type: string;
        dataPath: string;
        dataPathSegs: string[];
    }>;
    mappingType?: 'copy' | 'iterate';
}

declare global {
    interface Window {
        angularComponentRef: AppComponent;
    }
}

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss']
})
export class AppComponent implements AfterViewInit {
    title = 'sandbox';
    sources = [];
    targets = [];
    mappings: ArrayMapping[] = [];
    selectedTargetId: string | null = null;
    targetConfigs: any = {};
    connectionLines: Array<any> = [];
    expandedObjects: Set<string> = new Set();
    hasElseBlock = false;
    conditionalConfigs: any = {};

    // Add property to store mapping type per target
    private targetMappingStates: any = {};

    // Getter/setter for isConditionalMapping
    get isConditionalMapping() {
        if (!this.selectedTargetId) return false;
        return this.targetMappingStates[this.selectedTargetId]?.isConditional || false;
    }

    set isConditionalMapping(value) {
        if (!this.selectedTargetId) return;
        if (!this.targetMappingStates[this.selectedTargetId]) {
            this.targetMappingStates[this.selectedTargetId] = { isConditional: value };
        } else {
            this.targetMappingStates[this.selectedTargetId].isConditional = value;
        }
    }

    @ViewChildren('sourceItem') sourceElements!: QueryList<ElementRef>;
    @ViewChildren('targetItem') targetElements!: QueryList<ElementRef>;
    @ViewChild('container') container!: ElementRef;

    get nodeIds() {
        return [...new Set(this.sources.map(item => item.nodeId))];
    }

    getSourcesByNodeId(nodeId) {
        return this.sources.filter(item => item.nodeId === nodeId);
    }

    getMappedTargets(sourceId) {
        return this.mappings
            .filter(m => m.sourceId === sourceId)
            .map(m => this.findTargetById(m.targetId))
            .filter(t => t !== undefined) as FieldDefinition[];
    }

    getMappedSources(targetId) {
        return this.mappings
            .filter(m => m.targetId === targetId)
            .map(m => this.findSourceById(m.sourceId))
            .filter(s => s !== undefined) as FieldDefinition[];
    }

    getSourceIdsForTarget(targetId) {
        const mappedSources = this.getMappedSources(targetId);
        if (!mappedSources.length) return '';

        // Get existing config or create new template with mustache syntax
        const existingConfig = this.targetConfigs[targetId];
        if (existingConfig) return existingConfig;

        // Create new template with all mapped sources
        return mappedSources
            .map(source => `{{${source.dataPath}}}`)
            .join(' ');
    }

    isTargetConfigured(targetId) {
        // Check if there are any mappings for this target
        const hasMappings = this.mappings.some(m => m.targetId === targetId);

        // Check if there is a non-empty simple configuration
        const hasSimpleConfig = this.targetConfigs[targetId]?.trim().length > 0;

        // Check if there is a non-empty conditional configuration
        const conditionalConfig = this.conditionalConfigs[targetId];
        const hasConditionalConfig = conditionalConfig && (
            conditionalConfig.conditions.some(block =>
                block.condition?.trim().length > 0 ||
                block.value.trim().length > 0
            )
        );

        // Return true only if there are no mappings but there is a non-empty configuration
        return !hasMappings && (hasSimpleConfig || hasConditionalConfig);
    }

    onConfigChange(event: Event, targetId) {
        const textarea = event.target as HTMLTextAreaElement;
        const newValue = textarea.value.trim();

        if (newValue === '') {
            // If textarea is empty, remove all mappings and config
            const mappingsToRemove = this.mappings.filter(m => m.targetId === targetId);
            mappingsToRemove.forEach(mapping => {
                this.removeMapping(mapping.sourceId, mapping.targetId, null);
            });
            delete this.targetConfigs[targetId];
            return;
        }

        // Just update the config value - no pattern checking
        this.targetConfigs[targetId] = newValue;
    }

    toggleTarget(targetId) {
        this.selectedTargetId = this.selectedTargetId === targetId ? null : targetId;
    }

    toggleObjectExpansion(id) {
        if (this.expandedObjects.has(id)) {
            this.expandedObjects.delete(id);
        } else {
            this.expandedObjects.add(id);
        }
        // Redraw lines after expanding/collapsing
        setTimeout(() => this.drawConnectionLines(), 100);
    }

    isObjectExpanded(id) {
        return this.expandedObjects.has(id);
    }

    constructor() {
        // Create sample data with nested objects
        this.sources = [
            { _id: 'source1', type: 'String', nodeId: 'Node1', dataPath: 'firstName', dataPathSegs: ['firstName'] },
            { _id: 'source2', type: 'String', nodeId: 'Node1', dataPath: 'lastName', dataPathSegs: ['lastName'] },
            {
                _id: 'source3',
                type: 'Object',
                nodeId: 'Node1',
                dataPath: 'address',
                dataPathSegs: ['address'],
                objDef: [
                    { _id: 'source3_1', type: 'String', nodeId: 'Node1', dataPath: 'address.street', dataPathSegs: ['address', 'street'] },
                    { _id: 'source3_2', type: 'String', nodeId: 'Node1', dataPath: 'address.city', dataPathSegs: ['address', 'city'] },
                    { _id: 'source3_3', type: 'String', nodeId: 'Node1', dataPath: 'address.zipCode', dataPathSegs: ['address', 'zipCode'] }
                ]
            },
            { _id: 'source4', type: 'String', nodeId: 'Node2', dataPath: 'email', dataPathSegs: ['email'] },
            {
                _id: 'source5',
                type: 'Object',
                nodeId: 'Node2',
                dataPath: 'contact',
                dataPathSegs: ['contact'],
                objDef: [
                    { _id: 'source5_1', type: 'String', nodeId: 'Node2', dataPath: 'contact.phone', dataPathSegs: ['contact', 'phone'] },
                    { _id: 'source5_2', type: 'String', nodeId: 'Node2', dataPath: 'contact.mobile', dataPathSegs: ['contact', 'mobile'] }
                ]
            },
            // Add array examples
            {
                _id: 'source6',
                type: 'Array',
                nodeId: 'Node2',
                dataPath: 'tags',
                dataPathSegs: ['tags'],
                arrayItemType: 'String'
            },
            {
                _id: 'source7',
                type: 'Array',
                nodeId: 'Node2',
                dataPath: 'addresses',
                dataPathSegs: ['addresses'],
                arrayItemType: 'Object',
                arrayItemDef: {
                    _id: 'source7_item',
                    type: 'Object',
                    nodeId: 'Node2',
                    dataPath: 'addresses[].item',
                    dataPathSegs: ['addresses', 'item'],
                    objDef: [
                        { _id: 'source7_item_1', type: 'String', nodeId: 'Node2', dataPath: 'addresses[].street', dataPathSegs: ['addresses', 'street'] },
                        { _id: 'source7_item_2', type: 'String', nodeId: 'Node2', dataPath: 'addresses[].city', dataPathSegs: ['addresses', 'city'] },
                        { _id: 'source7_item_3', type: 'String', nodeId: 'Node2', dataPath: 'addresses[].country', dataPathSegs: ['addresses', 'country'] }
                    ]
                }
            }
        ];

        this.targets = [
            { _id: 'target1', type: 'String', nodeId: 'Node1', dataPath: 'name', dataPathSegs: ['name'] },
            { _id: 'target2', type: 'String', nodeId: 'Node1', dataPath: 'surname', dataPathSegs: ['surname'] },
            {
                _id: 'target3',
                type: 'Object',
                nodeId: 'Node1',
                dataPath: 'location',
                dataPathSegs: ['location'],
                objDef: [
                    { _id: 'target3_1', type: 'String', nodeId: 'Node1', dataPath: 'location.addressLine', dataPathSegs: ['location', 'addressLine'] },
                    { _id: 'target3_2', type: 'String', nodeId: 'Node1', dataPath: 'location.cityName', dataPathSegs: ['location', 'cityName'] },
                    { _id: 'target3_3', type: 'String', nodeId: 'Node1', dataPath: 'location.postalCode', dataPathSegs: ['location', 'postalCode'] }
                ]
            },
            { _id: 'target4', type: 'String', nodeId: 'Node1', dataPath: 'emailAddress', dataPathSegs: ['emailAddress'] },
            { _id: 'target5', type: 'String', nodeId: 'Node1', dataPath: 'phoneNumber', dataPathSegs: ['phoneNumber'] },
            // Add array examples
            {
                _id: 'target6',
                type: 'Array',
                nodeId: 'Node1',
                dataPath: 'categories',
                dataPathSegs: ['categories'],
                arrayItemType: 'String'
            },
            {
                _id: 'target7',
                type: 'Array',
                nodeId: 'Node1',
                dataPath: 'contactAddresses',
                dataPathSegs: ['contactAddresses'],
                arrayItemType: 'Object',
                arrayItemDef: {
                    _id: 'target7_item',
                    type: 'Object',
                    nodeId: 'Node1',
                    dataPath: 'contactAddresses[].item',
                    dataPathSegs: ['contactAddresses', 'item'],
                    objDef: [
                        { _id: 'target7_item_1', type: 'String', nodeId: 'Node1', dataPath: 'contactAddresses[].line1', dataPathSegs: ['contactAddresses', 'line1'] },
                        { _id: 'target7_item_2', type: 'String', nodeId: 'Node1', dataPath: 'contactAddresses[].city', dataPathSegs: ['contactAddresses', 'city'] },
                        { _id: 'target7_item_3', type: 'String', nodeId: 'Node1', dataPath: 'contactAddresses[].region', dataPathSegs: ['contactAddresses', 'region'] }
                    ]
                }
            }
        ];
    }

    onDragStart(event: DragEvent, item: any) {

        // Stop event from bubbling up to parent elements
        event.stopPropagation();

        if (event.dataTransfer) {
            event.dataTransfer.setData('text', JSON.stringify(item));
        }

        // Set a class on the element being dragged
        const element = event.target as HTMLElement;
        element.classList.add('dragging');

        // Remove the class when the drag ends
        const dragEndHandler = () => {
            element.classList.remove('dragging');
            element.removeEventListener('dragend', dragEndHandler);
        };

        element.addEventListener('dragend', dragEndHandler);
    }

    onDragOver(event: DragEvent) {
        event.preventDefault();
    }

    onDrop(event: DragEvent, targetItem: any) {
        event.preventDefault();
        const data = event.dataTransfer?.getData('text');
        if (!data) return;

        const sourceItem = JSON.parse(data);

        // Check if both source and target are arrays
        if (sourceItem.type === 'Array' && targetItem.type === 'Array') {
            const mappingType = confirm(
                'How do you want to map the arrays?\n\n' +
                'OK - Copy the entire array\n' +
                'Cancel - Iterate over array items'
            ) ? 'copy' : 'iterate';

            // Add mapping with type
            this.addMapping(sourceItem._id, targetItem._id, { mappingType });
            return;
        }

        // Check if target is an array with child items
        if (targetItem.type === 'Array' && this.hasArrayItems(targetItem)) {
            alert('Cannot map to array while it has indexed items. Remove all indices first.');
            return;
        }

        const validation = this.validateMapping(sourceItem._id, targetItem._id);

        if (!validation.isValid) {
            const forceMap = confirm(`${validation.message}\n\nWould you like to force map anyway?`);
            if (forceMap) {
                this.addMapping(sourceItem._id, targetItem._id, { isForceMapping: true });
                return;
            }
            return;
        }

        if (validation.requiresIndex) {
            const forceMap = confirm('This mapping requires an array index. Click OK to force map or Cancel to specify an index.');
            if (forceMap) {
                this.addMapping(sourceItem._id, targetItem._id, { isForceMapping: true });
            } else {
                const index = prompt('Enter the array index:');
                if (index !== null) {
                    const numIndex = parseInt(index);
                    if (!isNaN(numIndex) && numIndex >= 0) {
                        this.addMapping(sourceItem._id, targetItem._id, { index: numIndex });
                    } else {
                        alert('Please enter a valid non-negative number');
                        return;
                    }
                }
            }
            return;
        }

        // Regular mapping
        const mappingExists = this.mappings.some(
            m => m.sourceId === sourceItem._id && m.targetId === targetItem._id
        );

        if (!mappingExists) {
            const { hasConflict, conflictingMappings, message } = this.wouldCreateMappingConflict(
                sourceItem._id, targetItem._id
            );

            if (hasConflict) {
                const forceMap = confirm(`${message}\n\nWould you like to force map anyway?`);
                if (forceMap) {
                    conflictingMappings.forEach(mapping => {
                        this.removeMapping(mapping.sourceId, mapping.targetId, null);
                    });
                    this.addMapping(sourceItem._id, targetItem._id, { isForceMapping: true });
                }
            } else {
                this.addMapping(sourceItem._id, targetItem._id);
            }
        }
    }

    getMappedSourcesPaths(targetId) {
        const sources = this.getMappedSources(targetId);
        if (sources.length === 0) return '';

        if (sources.length <= 2) {
            return sources.map(s => s.dataPath).join(', ');
        }
        return `${sources[0].dataPath}, ${sources[1].dataPath} +${sources.length - 2} more`;
    }

    getMappedSourcesTooltip(targetId) {
        return this.getMappedSources(targetId)
            .map(s => s.dataPath)
            .join('\n');
    }

    ngAfterViewInit() {
        setTimeout(() => this.drawConnectionLines(), 100);
    }

    @HostListener('window:resize')
    onResize() {
        this.drawConnectionLines();
    }

    drawConnectionLines() {
        this.connectionLines = [];
        const sourceElements = document.querySelectorAll('.source-list .drag-item');
        const targetElements = document.querySelectorAll('.target-list .drag-item');

        // Get the container's position for relative calculations
        const containerRect = document.querySelector('.container-fluid')?.getBoundingClientRect();
        if (!containerRect) return;

        this.mappings.forEach(mapping => {
            const sourceElement = Array.from(sourceElements).find(
                el => el.getAttribute('data-id') === mapping.sourceId
            );
            const targetElement = Array.from(targetElements).find(
                el => el.getAttribute('data-id') === mapping.targetId
            );

            if (sourceElement && targetElement) {
                // Get the header elements (the first div containing the item info)
                const sourceHeader = sourceElement.querySelector('.p-2.mb-2.bg-light') as HTMLElement;
                const targetHeader = targetElement.querySelector('.p-2.mb-2.bg-light') as HTMLElement;

                if (sourceHeader && targetHeader) {
                    const sourceRect = sourceHeader.getBoundingClientRect();
                    const targetRect = targetHeader.getBoundingClientRect();

                    // Calculate positions relative to container
                    const x1 = sourceRect.right - containerRect.left;
                    const y1 = sourceRect.top - containerRect.top + (sourceRect.height / 2);
                    const x2 = targetRect.left - containerRect.left;
                    const y2 = targetRect.top - containerRect.top + (targetRect.height / 2);

                    this.connectionLines.push({
                        x1, y1, x2, y2,
                        sourceId: mapping.sourceId,
                        targetId: mapping.targetId
                    });
                }
            }
        });
    }

    getContainerWidth(): number {
        const container = document.querySelector('.container-fluid');
        return container ? container.clientWidth : 1200;
    }

    getContainerHeight(): number {
        const container = document.querySelector('.container-fluid');
        return container ? container.clientHeight : 800;
    }

    activateTarget(targetId, event: MouseEvent) {
        console.log('activateTarget called for:', targetId);
        // Only activate if we're not clicking on the expand/collapse button
        if (!(event.target as HTMLElement).closest('.btn-expand') &&
            !(event.target as HTMLElement).closest('.btn-remove-mapping')) {
            this.selectedTargetId = targetId;
            event.stopPropagation();
        }

        // Initialize mapping state if not exists
        if (!this.targetMappingStates[targetId]) {
            this.targetMappingStates[targetId] = {
                isConditional: false
            };
        }
    }

    // Check if a source is a parent of another source
    isParentOf(parentId, childId) {
        const parent = this.findSourceById(parentId);
        if (!parent || parent.type !== 'Object' || !parent.objDef) {
            return false;
        }

        // Check direct children
        if (parent.objDef.some(child => child._id === childId)) {
            return true;
        }

        // Check nested children recursively
        return parent.objDef.some(child =>
            child.type === 'Object' && this.isParentOf(child._id, childId)
        );
    }

    // Check if a source is a child of another source
    isChildOf(childId, parentId) {
        return this.isParentOf(parentId, childId);
    }

    // Find a source by ID (including nested sources)
    findSourceById(id): FieldDefinition | undefined {
        // Check top-level sources
        const source = this.sources.find(s => s._id === id);
        if (source) {
            return source;
        }

        // Check nested sources in objects
        for (const parent of this.sources) {
            if (parent.type === 'Object' && parent.objDef) {
                const found = this.findNestedSourceById(parent.objDef, id);
                if (found) {
                    return found;
                }
            }

            // Check nested sources in arrays of objects
            if (parent.type === 'Array' && parent.arrayItemType === 'Object' && parent.arrayItemDef) {
                if (parent.arrayItemDef._id === id) {
                    return parent.arrayItemDef;
                }

                if (parent.arrayItemDef.objDef) {
                    const found = this.findNestedSourceById(parent.arrayItemDef.objDef, id);
                    if (found) {
                        return found;
                    }
                }
            }
        }

        return undefined;
    }

    // Helper to find a nested source by ID
    findNestedSourceById(sources, id): FieldDefinition | undefined {
        for (const source of sources) {
            if (source._id === id) {
                return source;
            }

            if (source.type === 'Object' && source.objDef) {
                const found = this.findNestedSourceById(source.objDef, id);
                if (found) {
                    return found;
                }
            }

            // Check array item properties
            if (source.type === 'Array' && source.arrayItemType === 'Object' && source.arrayItemDef) {
                if (source.arrayItemDef._id === id) {
                    return source.arrayItemDef;
                }

                if (source.arrayItemDef.objDef) {
                    const found = this.findNestedSourceById(source.arrayItemDef.objDef, id);
                    if (found) {
                        return found;
                    }
                }
            }
        }

        return undefined;
    }

    // Add a method to find a target by ID (including nested targets)
    findTargetById(id): FieldDefinition | undefined {
        // Check top-level targets
        const target = this.targets.find(t => t._id === id);
        if (target) {
            return target;
        }

        // Check nested targets in objects
        for (const parent of this.targets) {
            if (parent.type === 'Object' && parent.objDef) {
                const found = this.findNestedTargetById(parent.objDef, id);
                if (found) {
                    return found;
                }
            }

            // Check nested targets in arrays of objects
            if (parent.type === 'Array' && parent.arrayItemType === 'Object' && parent.arrayItemDef) {
                if (parent.arrayItemDef._id === id) {
                    return parent.arrayItemDef;
                }

                if (parent.arrayItemDef.objDef) {
                    const found = this.findNestedTargetById(parent.arrayItemDef.objDef, id);
                    if (found) {
                        return found;
                    }
                }
            }
        }

        return undefined;
    }

    // Helper to find a nested target by ID
    findNestedTargetById(targets, id): FieldDefinition | undefined {
        for (const target of targets) {
            if (target._id === id) {
                return target;
            }

            if (target.type === 'Object' && target.objDef) {
                const found = this.findNestedTargetById(target.objDef, id);
                if (found) {
                    return found;
                }
            }

            // Check array item properties
            if (target.type === 'Array' && target.arrayItemType === 'Object' && target.arrayItemDef) {
                if (target.arrayItemDef._id === id) {
                    return target.arrayItemDef;
                }

                if (target.arrayItemDef.objDef) {
                    const found = this.findNestedTargetById(target.arrayItemDef.objDef, id);
                    if (found) {
                        return found;
                    }
                }
            }
        }

        return undefined;
    }

    // Check if mapping would create a conflict
    wouldCreateMappingConflict(sourceId, targetId): { hasConflict, conflictingMappings: Array<{ sourceId, targetId }>, message } {
        const conflicts: Array<{ sourceId, targetId }> = [];
        let message = '';

        // Get the source and target
        const source = this.findSourceById(sourceId);
        const target = this.findTargetById(targetId);

        // Skip conflict detection for array item properties mapping to array item properties
        const isArrayItemToArrayItem =
            sourceId.includes('_item_') && targetId.includes('_item_');

        if (isArrayItemToArrayItem) {
            return {
                hasConflict: false,
                conflictingMappings: [],
                message: ''
            };
        }

        // Continue with regular conflict detection
        if (source?.type === 'Object' && source.objDef) {
            // Get all child source IDs
            const childSourceIds = this.findAllNestedSourceIds(source.objDef);

            // Check if any child is already mapped
            childSourceIds.forEach(childId => {
                const childMappings = this.mappings.filter(m => m.sourceId === childId);
                conflicts.push(...childMappings);
            });

            if (conflicts.length > 0) {
                message = `Object ${source.dataPath} has ${conflicts.length} child field(s) already mapped. Mapping the parent object will remove all child mappings. Continue?`;
            }
        }

        if (target?.type === 'Object' && target.objDef) {
            // Get all child target IDs
            const childTargetIds = this.findAllNestedTargetIds(target.objDef);

            // Check if any child target is already mapped from any source
            const childTargetMappings: Array<{ sourceId, targetId }> = [];
            childTargetIds.forEach(childTargetId => {
                const mappings = this.mappings.filter(m => m.targetId === childTargetId);
                childTargetMappings.push(...mappings);
            });

            if (childTargetMappings.length > 0) {
                message = `Target ${target.dataPath} has ${childTargetMappings.length} child field(s) already mapped. Mapping to the parent will remove these child mappings. Continue?`;
                conflicts.push(...childTargetMappings);
            }
        }

        return {
            hasConflict: conflicts.length > 0,
            conflictingMappings: conflicts,
            message: message
        };
    }

    // Get all nested source IDs
    findAllNestedSourceIds(sources) {
        const ids = [];

        sources.forEach(source => {
            ids.push(source._id);

            if (source.type === 'Object' && source.objDef) {
                ids.push(...this.findAllNestedSourceIds(source.objDef));
            } else if (source.type === 'Array' && source.arrayItemType === 'Object' && source.arrayItemDef) {
                // For arrays of objects, include the array item definition ID
                ids.push(source.arrayItemDef._id);

                // And include all nested properties of the array item
                if (source.arrayItemDef.objDef) {
                    ids.push(...this.findAllNestedSourceIds(source.arrayItemDef.objDef));
                }
            }
        });

        return ids;
    }

    // Get all nested target IDs
    findAllNestedTargetIds(targets) {
        const ids = [];

        targets.forEach(target => {
            ids.push(target._id);

            if (target.type === 'Object' && target.objDef) {
                ids.push(...this.findAllNestedTargetIds(target.objDef));
            } else if (target.type === 'Array' && target.arrayItemType === 'Object' && target.arrayItemDef) {
                // For arrays of objects, include the array item definition ID
                ids.push(target.arrayItemDef._id);

                // And include all nested properties of the array item
                if (target.arrayItemDef.objDef) {
                    ids.push(...this.findAllNestedTargetIds(target.arrayItemDef.objDef));
                }
            }
        });

        return ids;
    }

    removeMapping(sourceId, targetId, event: Event | null) {
        if (event) {
            event.stopPropagation();
        }

        // Remove the mapping
        this.mappings = this.mappings.filter(m =>
            !(m.sourceId === sourceId && m.targetId === targetId)
        );

        // Update the config if it exists
        if (this.targetConfigs[targetId]) {
            const source = this.findSourceById(sourceId);
            if (source) {
                const mustachePattern = `{{${source.dataPath}}}`;
                this.targetConfigs[targetId] = this.targetConfigs[targetId]
                    .replace(mustachePattern, '')
                    .trim();
            }
        }

        // Remove config if empty
        if (this.targetConfigs[targetId]?.trim() === '') {
            delete this.targetConfigs[targetId];
        }

        // Redraw connection lines
        this.drawConnectionLines();
    }

    // Add a debug method to help troubleshoot
    logMappings() {
        console.log('Current mappings:', this.mappings);
    }

    validateMapping(sourceId, targetId): ValidationResult {
        const source = this.findSourceById(sourceId);
        const target = this.findTargetById(targetId);

        if (!source || !target) {
            return { isValid: false, message: 'Invalid source or target' };
        }

        const sourceParent = this.findParentField(source);
        const targetParent = this.findParentField(target);

        // ARRAY VALIDATIONS

        // Case 1: Array -> Array (allowed)
        if (source.type === 'Array' && target.type === 'Array') {
            return { isValid: true };
        }

        // Case 2: Array -> Non-array (require index)
        if (source.type === 'Array' && target.type !== 'Array') {
            return {
                isValid: true,
                requiresIndex: true,
                message: 'Mapping from an array requires an index. Would you like to specify an index?'
            };
        }

        // Case 3: Array item -> Array item (require parent arrays to be mapped)
        if (sourceParent?.type === 'Array' && targetParent?.type === 'Array') {
            const parentArraysMapped = this.mappings.some(m =>
                m.sourceId === sourceParent._id &&
                m.targetId === targetParent._id
            );

            if (!parentArraysMapped) {
                return {
                    isValid: false,
                    message: 'Parent arrays must be mapped before mapping their items.',
                    isTypeError: true
                };
            }
            return { isValid: true };
        }

        // Case 4: Array item -> Non-array item (require index)
        if (sourceParent?.type === 'Array' && targetParent?.type !== 'Array') {
            return {
                isValid: true,
                requiresIndex: true,
                message: 'Mapping from an array item requires an index. Would you like to specify an index?'
            };
        }

        // Case 5: Non-array -> Array (require index creation)
        if (target.type === 'Array') {
            const hasIndices = this.hasArrayItems(target);
            if (hasIndices) {
                return {
                    isValid: false,
                    message: 'Cannot map to array while it has indexed items. Remove all indices first.',
                    isTypeError: true
                };
            }
            return {
                isValid: true,
                requiresIndex: true,
                message: 'Cannot map directly to an array. Would you like to create an index?'
            };
        }

        // OBJECT VALIDATIONS

        // Case 1: Object item -> Object item (check parent mapping)
        if (sourceParent?.type === 'Object' && targetParent?.type === 'Object') {
            const parentObjectsMapped = this.mappings.some(m =>
                m.sourceId === sourceParent._id &&
                m.targetId === targetParent._id
            );
            if (parentObjectsMapped) {
                return {
                    isValid: false,
                    message: 'Cannot map object properties when parent objects are already mapped.',
                    isTypeError: true
                };
            }
        }

        // Case 2: Object -> Object (warn about child mappings)
        if (source.type === 'Object' && target.type === 'Object') {
            const hasChildMappings = this.hasChildMappings(targetId);
            if (hasChildMappings) {
                return {
                    isValid: true,
                    message: 'Warning: Mapping objects will remove any existing child property mappings.',
                    requiresConfirmation: true
                };
            }
        }

        return { isValid: true };
    }

    private hasChildMappings(objectId) {
        const object = this.findTargetById(objectId);
        if (!object?.objDef) return false;

        return object.objDef.some(child =>
            this.mappings.some(m => m.targetId === child._id) ||
            this.hasChildMappings(child._id)
        );
    }

    // Add helper method to find parent field
    private findParentField(field: FieldDefinition): FieldDefinition | null {
        if (field.dataPathSegs.length <= 1) return null;

        const parentPath = field.dataPathSegs.slice(0, -1).join('.');
        const parentId = this.findIdByPath(parentPath);

        return parentId ? (this.findSourceById(parentId) || this.findTargetById(parentId)) : null;
    }

    private findIdByPath(path) {
        // First check sources
        const source = this.sources.find(s => s.dataPath === path);
        if (source) return source._id;

        // Then check targets
        const target = this.targets.find(t => t.dataPath === path);
        if (target) return target._id;

        return null;
    }

    private addMapping(sourceId, targetId, options?: { index?: number, isForceMapping?, mappingType?: 'copy' | 'iterate' }) {
        this.mappings.push({
            sourceId,
            targetId,
            ...(options?.index !== undefined ? { index: options.index } : {}),
            ...(options?.isForceMapping ? { isForceMapping: true } : {}),
            ...(options?.mappingType ? { mappingType: options.mappingType } : {})
        });

        this.selectedTargetId = targetId;
        setTimeout(() => this.drawConnectionLines(), 100);
    }

    getMappingDisplay(mapping: ArrayMapping) {
        if (mapping.isForceMapping) {
            return '(forced)';
        }
        return mapping.index !== undefined ? `[${mapping.index}]` : '';
    }

    // Add this method to get the mapping details for a source-target pair
    getMappingForSource(sourceId, targetId): ArrayMapping | undefined {
        const mapping = this.mappings.find(m =>
            m.sourceId === sourceId && m.targetId === targetId
        ) as ArrayMapping;

        return mapping;
    }

    // Add method to create array items
    createArrayItem(arrayField: FieldDefinition, event: Event) {
        event.stopPropagation();

        // Check if array is mapped
        const isArrayMapped = this.mappings.some(m => m.targetId === arrayField._id);
        if (isArrayMapped) {
            alert('Cannot create array items while array is mapped. Remove the array mapping first.');
            return;
        }

        // Find existing indices
        const existingIndices = this.targets
            .filter(t => t.dataPath.startsWith(arrayField.dataPath + '['))
            .map(t => t.arrayIndex || 0);

        const nextIndex = existingIndices.length > 0 ? Math.max(...existingIndices) + 1 : 0;

        // Create new array item with index
        const newItem: FieldDefinition = {
            _id: `${arrayField._id}_${nextIndex}`,
            type: arrayField.arrayItemType as any, // Use the array's item type
            dataPath: `${arrayField.dataPath}[${nextIndex}]`,
            dataPathSegs: [...arrayField.dataPathSegs, `[${nextIndex}]`],
            arrayIndex: nextIndex,
            nodeId: arrayField.nodeId,
            // Only add objDef if it's an Object type
            ...(arrayField.arrayItemType === 'Object' ? {
                objDef: arrayField.arrayItemDef?.objDef?.map(def => ({
                    _id: `${def._id}_${nextIndex}`,
                    type: def.type,
                    dataPath: `${arrayField.dataPath}[${nextIndex}].${def.dataPathSegs[def.dataPathSegs.length - 1]}`,
                    dataPathSegs: [...arrayField.dataPathSegs, `[${nextIndex}]`, def.dataPathSegs[def.dataPathSegs.length - 1]],
                    arrayItemType: def.arrayItemType,
                    arrayItemDef: def.arrayItemDef,
                    objDef: def.objDef,
                    arrayIndex: nextIndex,
                    nodeId: def.nodeId
                })) || []
            } : {})
        };

        // Find the last item with same array base path
        const lastArrayItemIndex = this.targets.reduce((lastIndex, item, currentIndex) => {
            if (item.dataPath.startsWith(arrayField.dataPath + '[')) {
                return currentIndex;
            }
            return lastIndex;
        }, -1);

        // Insert after the last array item, or after the array if no items exist
        const insertIndex = lastArrayItemIndex === -1 ?
            this.targets.findIndex(t => t._id === arrayField._id) + 1 :
            lastArrayItemIndex + 1;

        // Add only the array item container
        this.targets.splice(insertIndex, 0, newItem);
    }

    // Add these methods to the component class
    hasArrayItems(arrayField: FieldDefinition) {
        return this.targets.some(t =>
            t.dataPath.startsWith(arrayField.dataPath + '[') &&
            t.arrayIndex !== undefined
        );
    }

    removeLastArrayItem(arrayField: FieldDefinition, event: Event) {
        event.stopPropagation();

        // Find all items with this array's path
        const arrayItems = this.targets
            .filter(t => t.dataPath.startsWith(arrayField.dataPath + '['))
            .sort((a, b) => (b.arrayIndex || 0) - (a.arrayIndex || 0));

        if (arrayItems.length > 0) {
            const lastIndex = arrayItems[0].arrayIndex;

            // Remove all items with this index
            this.targets = this.targets.filter(t =>
                !t.dataPath.startsWith(arrayField.dataPath + `[${lastIndex}]`)
            );

            // Remove any mappings for the removed items
            this.mappings = this.mappings.filter(m => {
                const mapping = this.findTargetById(m.targetId);
                return mapping && !mapping.dataPath.startsWith(arrayField.dataPath + `[${lastIndex}]`);
            });
        }
    }

    onSourceDragStart(event: DragEvent, source: FieldDefinition) {
        if (event.dataTransfer) {
            // Set just the dataPath - we'll add mustache syntax on drop
            event.dataTransfer.setData('text/plain', source.dataPath);
            event.dataTransfer.effectAllowed = 'copy';
        }
    }

    onTextAreaDragOver(event: DragEvent) {
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'copy';
        }
    }

    onTextAreaDrop(event: DragEvent) {
        event.preventDefault();
        const textarea = event.target as HTMLTextAreaElement;
        const dataPath = event.dataTransfer?.getData('text/plain');

        if (dataPath) {
            // Get cursor position or end of text
            const cursorPos = textarea.selectionStart || textarea.value.length;
            const textBefore = textarea.value.substring(0, cursorPos);
            const textAfter = textarea.value.substring(cursorPos);

            // Insert the dataPath with mustache syntax only during drop
            const newValue = `${textBefore}{{${dataPath}}}${textAfter}`;

            // Update textarea value
            textarea.value = newValue;

            // Trigger the config change
            this.onConfigChange({ target: textarea } as any, this.selectedTargetId!);

            // Set cursor position after the inserted text
            const newCursorPos = cursorPos + dataPath.length + 6; // +6 for {{ }} and spaces
            textarea.setSelectionRange(newCursorPos, newCursorPos);
            textarea.focus();
        }
    }

    onMappingTypeChange() {
        if (!this.selectedTargetId) return;

        const isConditional = this.isConditionalMapping;

        // Initialize conditional config if switching to conditional
        if (isConditional) {
            if (!this.conditionalConfigs[this.selectedTargetId]) {
                this.conditionalConfigs[this.selectedTargetId] = {
                    conditions: []
                };
            }
            // Initialize hasElseBlock based on config
            this.hasElseBlock = this.conditionalConfigs[this.selectedTargetId].conditions.length > 0;
        }
    }

    getConditionValue(type, targetId, index?: number) {
        const config = this.conditionalConfigs[targetId];
        if (!config) return '';

        if (type === 'elseif') {
            const elseifBlocks = config.conditions.filter(c => c.type === 'elseif');
            return elseifBlocks[index || 0]?.condition || '';
        }
        const block = config.conditions.find(c => c.type === type);
        return block?.condition || '';
    }

    getThenValue(type, targetId, index?: number) {
        const config = this.conditionalConfigs[targetId];
        if (!config) return '';

        if (type === 'elseif') {
            const elseifBlocks = config.conditions.filter(c => c.type === 'elseif');
            return elseifBlocks[index || 0]?.value || '';
        }
        const block = config.conditions.find(c => c.type === type);
        return block?.value || '';
    }

    onConditionChange(event: Event, type, targetId: string, index?: number) {
        const newCondition = (event.target as HTMLTextAreaElement).value;
        const config = this.getOrCreateConfig(targetId);

        if (type === 'elseif' && typeof index === 'number') {
            const elseifBlocks = config.conditions.filter(c => c.type === 'elseif');
            if (elseifBlocks[index]) {
                elseifBlocks[index].condition = newCondition;
            }
            return;
        }
        const block = config.conditions.find(c => c.type === type);
        if (block) {
            block.condition = newCondition;
        } else {
            config.conditions.push({
                type,
                condition: type !== 'else' ? newCondition : undefined,
                value: ''  // Initialize with empty value
            });
        }
    }

    onThenChange(event: Event, type, targetId: string, index?: number) {
        const newValue = (event.target as HTMLTextAreaElement).value;
        const config = this.getOrCreateConfig(targetId);

        if (type === 'elseif' && typeof index === 'number') {
            const elseifBlocks = config.conditions.filter(c => c.type === 'elseif');
            if (elseifBlocks[index]) {
                elseifBlocks[index].value = newValue;
            }
            return;
        }
        const block = config.conditions.find(c => c.type === type);
        if (block) {
            block.value = newValue;
        } else {
            config.conditions.push({
                type,
                value: newValue,
                condition: type !== 'else' ? '' : undefined  // Initialize with empty condition
            });
        }
    }

    addElseIfBlock() {
        if (!this.selectedTargetId) return;

        const config = this.getOrCreateConfig(this.selectedTargetId);
        config.conditions.push({
            type: 'elseif',
            value: ''
        });
        // Force change detection
        this.conditionalConfigs = { ...this.conditionalConfigs };
    }

    removeElseIfBlock(index: number) {
        if (!this.selectedTargetId) return;

        const config = this.conditionalConfigs[this.selectedTargetId];
        if (config && config.conditions) {
            config.conditions.splice(index, 1);
            // Force change detection
            this.conditionalConfigs = { ...this.conditionalConfigs };
        }
    }

    addElseBlock() {
        const config = this.getOrCreateConfig(this.selectedTargetId!);
        config.conditions.push({
            type: 'else',
            value: ''
        });
        this.hasElseBlock = true;
    }

    removeElseBlock() {
        const config = this.conditionalConfigs[this.selectedTargetId!];
        if (config) {
            config.conditions = [];
            this.hasElseBlock = false;
        }
    }

    private getOrCreateConfig(targetId): ConditionalConfig {
        if (!this.conditionalConfigs[targetId]) {
            this.conditionalConfigs[targetId] = {
                conditions: []
            };
        }
        return this.conditionalConfigs[targetId];
    }

    // Add getter for elseIfBlocks
    get elseIfBlocks(): ConditionalBlock[] {
        if (!this.selectedTargetId) return [];
        return (this.conditionalConfigs[this.selectedTargetId]?.conditions || [])
            .filter(block => block.type === 'elseif');
    }

    onDone() {
        setTimeout(() => {
            const payload = this.generatePayload();
            console.log('Mapping Payload:', payload);
        }, 0);
    }

    private generatePayload(): MappingPayload[] {
        // Track which targets have been included as children
        const includedAsChild = new Set<string>();

        // Function to mark a target and its children as included
        const markAsIncluded = (target: FieldDefinition) => {
            if (target.objDef) {
                target.objDef.forEach(child => {
                    includedAsChild.add(child._id);
                    markAsIncluded(child);
                });
            }
            if (target.type === 'Array') {
                const arrayItems = this.getArrayItems(target);
                arrayItems.forEach(item => {
                    includedAsChild.add(item._id);
                    markAsIncluded(item);
                });
            }
        };

        // Get root level targets and mark their children
        const rootTargets = this.targets.filter(target => {
            // If it's not an array item, check if it has no parent
            if (target.arrayIndex === undefined) {
                const isRoot = !this.findParentField(target);
                if (isRoot) {
                    markAsIncluded(target);
                }
                return isRoot;
            }
            // If it's an array item, check if its parent array is not in the mapping
            const parentArray = this.findParentArray(target);
            const isRoot = !parentArray || !this.hasMapping(parentArray._id);
            if (isRoot) {
                markAsIncluded(target);
            }
            return isRoot;
        });

        // Generate payload only for root targets that haven't been included as children
        return rootTargets
            .filter(target => !includedAsChild.has(target._id))
            .map(target => this.createMappingPayload(target))
            .filter(payload => this.isPayloadValid(payload));
    }

    private createMappingPayload(target: FieldDefinition): MappingPayload {
        const isConditional = this.targetMappingStates[target._id]?.isConditional || false;

        // Get mapped sources
        const sources = this.getMappedSources(target._id).map(source => ({
            _id: source._id,
            type: source.type,
            dataPath: source.dataPath,
            dataPathSegs: source.dataPathSegs
        }));

        // Create conditions array for conditional mapping
        let conditions: ConditionalBlock[] | undefined;
        if (isConditional && this.conditionalConfigs[target._id]) {
            // First get the 'if' block
            const ifBlock = this.conditionalConfigs[target._id].conditions.find(c => c.type === 'if');
            // Then get all 'elseif' blocks
            const elseifBlocks = this.conditionalConfigs[target._id].conditions.filter(c => c.type === 'elseif');
            // Finally get the 'else' block
            const elseBlock = this.conditionalConfigs[target._id].conditions.find(c => c.type === 'else');

            conditions = [
                // If block
                ifBlock ? {
                    type: 'if' as const,
                    value: ifBlock.value || '',
                    condition: ifBlock.condition || ''
                } : null,
                // Elseif blocks
                ...elseifBlocks.map(block => ({
                    type: 'elseif' as const,
                    value: block.value || '',
                    condition: block.condition || ''
                })),
                // Else block
                elseBlock ? {
                    type: 'else' as const,
                    value: elseBlock.value || '',
                    condition: undefined
                } : null
            ].filter(block => block !== null);
        }

        const payload: MappingPayload = {
            expression: {
                type: isConditional ? 'conditional' : 'simple',
                value: isConditional ? '' : (this.targetConfigs[target._id] || ''),
                conditions: isConditional ? conditions : undefined
            },
            key: target.dataPathSegs[target.dataPathSegs.length - 1],
            name: target.dataPath,
            target: {
                _id: target._id,
                type: target.type,
                dataPath: target.dataPath,
                dataPathSegs: target.dataPathSegs,
                arrayIndex: target.arrayIndex,
                arrayItemType: target.type === 'Array' ? target.arrayItemType : undefined
            },
            children: [],
            sources
        };

        return payload;
    }

    private isPayloadValid(payload: MappingPayload) {
        // Check if there are any sources mapped
        const hasSources = payload.sources.length > 0;

        // Check if there are any valid children
        const hasChildren = payload.children.length > 0;

        // Check if there is any configuration
        const hasConfig = payload.expression.type === 'simple' ?
            !!payload.expression.value.trim() :
            !!(payload.expression.conditions?.some(c => c.condition?.trim() || c.value.trim()));

        // Valid if it has sources, children, or configuration
        return hasSources || hasChildren || hasConfig;
    }

    private getArrayItems(arrayField: FieldDefinition) {
        // Get all array items that belong to this array
        return this.targets.filter(t =>
            t.arrayIndex !== undefined &&
            t.dataPath.startsWith(arrayField.dataPath + '[') &&
            // Ensure we only get direct children, not nested array items
            t.dataPath.match(/\[/g)?.length === 1
        );
    }

    private createArrayItemWithDefinition(arrayField: FieldDefinition, itemDef: FieldDefinition, index: number): FieldDefinition {
        return {
            _id: `${arrayField._id}_${index}`,
            type: itemDef.type,
            dataPath: `${arrayField.dataPath}[${index}]`,
            dataPathSegs: [...arrayField.dataPathSegs, index.toString()],
            arrayIndex: index,
            nodeId: arrayField.nodeId,
            objDef: itemDef.objDef,
            arrayItemType: itemDef.arrayItemType,
            arrayItemDef: itemDef.arrayItemDef
        };
    }

    private findParentArray(field: FieldDefinition): FieldDefinition | undefined {
        // For array items, find the parent array
        if (field.arrayIndex !== undefined) {
            const parentPath = field.dataPath.substring(0, field.dataPath.lastIndexOf('['));
            return this.targets.find(t => t.dataPath === parentPath);
        }
        return undefined;
    }

    private hasMapping(targetId) {
        return this.mappings.some(m => m.targetId === targetId) ||
            !!this.targetConfigs[targetId] ||
            !!this.conditionalConfigs[targetId];
    }

    applyPayload(payload: MappingPayload[]) {
        // Clear existing mappings and configurations
        this.mappings = [];
        this.targetConfigs = {};
        this.conditionalConfigs = {};
        this.targetMappingStates = {};

        // Recursive function to process each payload item
        const processPayloadItem = (item: MappingPayload) => {
            // Set mapping type
            this.targetMappingStates[item.target._id] = {
                isConditional: item.expression.type === 'conditional'
            };

            // Handle simple mapping
            if (item.expression.type === 'simple') {
                // Set configuration if exists
                if (item.expression.value) {
                    this.targetConfigs[item.target._id] = item.expression.value;
                }

                // Create mappings for sources
                item.sources.forEach(source => {
                    this.mappings.push({
                        sourceId: source._id,
                        targetId: item.target._id,
                        // Remove type property as it's not in the interface
                    });
                });
            }

            // Handle conditional mapping
            if (item.expression.type === 'conditional' && item.expression.conditions) {
                this.conditionalConfigs[item.target._id] = {
                    conditions: item.expression.conditions
                };

                // Set hasElseBlock if else condition exists
                if (item.target._id === this.selectedTargetId) {
                    this.hasElseBlock = item.expression.conditions.some(c => c.type === 'else');
                }
            }

            // Process children recursively
            item.children.forEach(child => processPayloadItem(child));
        };

        // Process each root level item
        payload.forEach(item => processPayloadItem(item));

        // Trigger change detection and UI updates
        this.drawConnectionLines();
    }
}
