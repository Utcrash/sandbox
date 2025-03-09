import { Component, AfterViewInit, ViewChildren, QueryList, ElementRef, HostListener, ViewChild } from '@angular/core';

interface FieldDefinition {
    _id: string;
    type: 'String' | 'Number' | 'Boolean' | 'Object' | 'Array';
    nodeId: string;
    dataPath: string;
    dataPathSegs: string[];
    objDef?: FieldDefinition[]; // For Object types
    arrayItemType?: 'String' | 'Number' | 'Boolean' | 'Object' | 'Array'; // For Array types
    arrayItemDef?: FieldDefinition; // For Array of Objects
    arrayIndex?: number;  // Add this to track array indices
}

interface ArrayMapping {
    sourceId: string;
    targetId: string;
    index?: number;
    isForceMapping?: boolean;
}

type ValidationResult = {
    isValid: boolean;
    message?: string;
    requiresIndex?: boolean;
    requiresParentArrayMapping?: boolean;
    isTypeError?: boolean;
    requiresConfirmation?: boolean;
};

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
    sources: FieldDefinition[] = [];
    targets: FieldDefinition[] = [];
    mappings: ArrayMapping[] = [];
    selectedTargetId: string | null = null;
    targetConfigs: { [key: string]: string } = {};
    connectionLines: Array<{ x1: number, y1: number, x2: number, y2: number, sourceId: string, targetId: string }> = [];
    expandedObjects: Set<string> = new Set();

    @ViewChildren('sourceItem') sourceElements!: QueryList<ElementRef>;
    @ViewChildren('targetItem') targetElements!: QueryList<ElementRef>;
    @ViewChild('container') container!: ElementRef;

    get nodeIds(): string[] {
        return [...new Set(this.sources.map(item => item.nodeId))];
    }

    getSourcesByNodeId(nodeId: string): FieldDefinition[] {
        return this.sources.filter(item => item.nodeId === nodeId);
    }

    getMappedTargets(sourceId: string): FieldDefinition[] {
        return this.mappings
            .filter(m => m.sourceId === sourceId)
            .map(m => this.findTargetById(m.targetId))
            .filter(t => t !== undefined) as FieldDefinition[];
    }

    getMappedSources(targetId: string): FieldDefinition[] {
        return this.mappings
            .filter(m => m.targetId === targetId)
            .map(m => this.findSourceById(m.sourceId))
            .filter(s => s !== undefined) as FieldDefinition[];
    }

    getSourceIdsForTarget(targetId: string): string {
        if (this.targetConfigs[targetId]) {
            return this.targetConfigs[targetId];
        }

        return this.mappings
            .filter(m => m.targetId === targetId)
            .map(m => {
                const source = this.findSourceById(m.sourceId);
                if (!source) return '';

                // For array mappings with index
                if ((source.type === 'Array' || m.sourceId.includes('_item_')) &&
                    (m as ArrayMapping).index !== undefined) {
                    return `${source.dataPath}[${(m as ArrayMapping).index}]`;
                }

                // For all other mappings (including forced array mappings)
                return source.dataPath;
            })
            .filter(path => path.length > 0)
            .join('\n');
    }

    isTargetConfigured(targetId: string): boolean {
        return !!this.targetConfigs[targetId];
    }

    onConfigChange(event: Event, targetId: string) {
        const value = (event.target as HTMLTextAreaElement).value;
        if (value.trim()) {
            this.targetConfigs[targetId] = value;
        } else {
            delete this.targetConfigs[targetId];
        }
    }

    toggleTarget(targetId: string) {
        this.selectedTargetId = this.selectedTargetId === targetId ? null : targetId;
    }

    toggleObjectExpansion(id: string) {
        if (this.expandedObjects.has(id)) {
            this.expandedObjects.delete(id);
        } else {
            this.expandedObjects.add(id);
        }
        // Redraw lines after expanding/collapsing
        setTimeout(() => this.drawConnectionLines(), 100);
    }

    isObjectExpanded(id: string): boolean {
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
                        this.removeMapping(mapping.sourceId, mapping.targetId);
                    });
                    this.addMapping(sourceItem._id, targetItem._id, { isForceMapping: true });
                }
            } else {
                this.addMapping(sourceItem._id, targetItem._id);
            }
        }
    }

    getMappedSourcesPaths(targetId: string): string {
        const sources = this.getMappedSources(targetId);
        if (sources.length === 0) return '';

        if (sources.length <= 2) {
            return sources.map(s => s.dataPath).join(', ');
        }
        return `${sources[0].dataPath}, ${sources[1].dataPath} +${sources.length - 2} more`;
    }

    getMappedSourcesTooltip(targetId: string): string {
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

    activateTarget(targetId: string, event: MouseEvent) {
        console.log('activateTarget called for:', targetId);
        // Only activate if we're not clicking on the expand/collapse button
        if (!(event.target as HTMLElement).closest('.btn-expand') &&
            !(event.target as HTMLElement).closest('.btn-remove-mapping')) {
            this.selectedTargetId = targetId;
            event.stopPropagation();
        }
    }

    // Check if a source is a parent of another source
    isParentOf(parentId: string, childId: string): boolean {
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
    isChildOf(childId: string, parentId: string): boolean {
        return this.isParentOf(parentId, childId);
    }

    // Find a source by ID (including nested sources)
    findSourceById(id: string): FieldDefinition | undefined {
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
    findNestedSourceById(sources: FieldDefinition[], id: string): FieldDefinition | undefined {
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
    findTargetById(id: string): FieldDefinition | undefined {
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
    findNestedTargetById(targets: FieldDefinition[], id: string): FieldDefinition | undefined {
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
    wouldCreateMappingConflict(sourceId: string, targetId: string): { hasConflict: boolean, conflictingMappings: Array<{ sourceId: string, targetId: string }>, message: string } {
        const conflicts: Array<{ sourceId: string, targetId: string }> = [];
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
            const childTargetMappings: Array<{ sourceId: string, targetId: string }> = [];
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
    findAllNestedSourceIds(sources: FieldDefinition[]): string[] {
        const ids: string[] = [];

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
    findAllNestedTargetIds(targets: FieldDefinition[]): string[] {
        const ids: string[] = [];

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

    removeMapping(sourceId: string, targetId: string, event?: MouseEvent) {
        if (event) {
            event.stopPropagation();
        }

        // Remove the mapping
        this.mappings = this.mappings.filter(m =>
            !(m.sourceId === sourceId && m.targetId === targetId)
        );

        // Redraw connection lines
        setTimeout(() => this.drawConnectionLines(), 100);
    }

    // Add a debug method to help troubleshoot
    logMappings() {
        console.log('Current mappings:', this.mappings);
    }

    validateMapping(sourceId: string, targetId: string): ValidationResult {
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

    private hasChildMappings(objectId: string): boolean {
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

    private findIdByPath(path: string): string | null {
        // First check sources
        const source = this.sources.find(s => s.dataPath === path);
        if (source) return source._id;

        // Then check targets
        const target = this.targets.find(t => t.dataPath === path);
        if (target) return target._id;

        return null;
    }

    private addMapping(sourceId: string, targetId: string, options?: { index?: number, isForceMapping?: boolean }) {
        this.mappings.push({
            sourceId,
            targetId,
            ...(options?.index !== undefined ? { index: options.index } : {}),
            ...(options?.isForceMapping ? { isForceMapping: true } : {})
        });

        this.selectedTargetId = targetId;
        setTimeout(() => this.drawConnectionLines(), 100);
    }

    getMappingDisplay(mapping: ArrayMapping): string {
        if (mapping.isForceMapping) {
            return '(forced)';
        }
        return mapping.index !== undefined ? `[${mapping.index}]` : '';
    }

    // Add this method to get the mapping details for a source-target pair
    getMappingForSource(sourceId: string, targetId: string): ArrayMapping | undefined {
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
            type: 'Object' as const,
            dataPath: `${arrayField.dataPath}[${nextIndex}]`,
            dataPathSegs: [...arrayField.dataPathSegs, `[${nextIndex}]`],
            arrayIndex: nextIndex,
            nodeId: arrayField.nodeId,
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
    hasArrayItems(arrayField: FieldDefinition): boolean {
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
}
