import { Injectable } from '@angular/core';

export interface SourceItem {
    _id: string;
    type?: string;
    key?: string;
    name?: string;
    nodeId?: string;
    dataPath?: string;
    dataPathSegs?: string[];
    objDef?: SourceItem[];
    arrayItemDef?: any;
    arrayItemType?: string;
}

@Injectable({
    providedIn: 'root'
})
export class SourceStructureService {
    private sources: SourceItem[] = [];

    constructor() { }

    convertToSourceStructure(data: any[]): SourceItem[] {
        const sources: SourceItem[] = [];

        for (const item of data) {
            // Create the root level item
            const source: SourceItem = {
                _id: item._id,
                type: this.normalizeType(item.type),
                key: item.key,
                name: item.name || item.key || this.getLastPathSegment(item.dataPath),
                dataPath: item.dataPath,
                dataPathSegs: item.dataPathSegs,
                nodeId: item.nodeId
            };

            // Handle different types at root level
            if (item.type === 'KeyValPair') {
                source.type = 'Object';
                source.objDef = this.processKeyValPairRefData(item.refData);
            }
            else if (item.type === 'Buffer') {
                source.type = 'String';
            }
            else if (item.type === 'Object' && item.refData?.definition) {
                source.objDef = [];
                this.processSchemaItems(item.refData.definition, item.nodeId, source.objDef);
            }
            else if (item.type === 'Array') {
                source.arrayItemType = 'Object';
                // Try to find array definition in schema first
                if (item.schema) {
                    const selfObject = item.schema[0];
                    if (selfObject && selfObject.key === '_self') {
                        source.arrayItemDef = {
                            _id: `${item._id}_item`,
                            type: 'Object',
                            nodeId: item.nodeId,
                            dataPath: `${item.dataPath}[]`,
                            dataPathSegs: [...item.dataPathSegs],
                            objDef: selfObject.schema ? this.processSchemaItems(selfObject.schema, item.nodeId, []) : []
                        };
                    }
                }
                // Try refData next
                else if (item.refData?.definition) {
                    const arrayDef = item.refData.definition.find(d => d.type === 'Array');
                    if (arrayDef?.definition) {
                        const selfObject = arrayDef.definition[0];
                        if (selfObject && selfObject.key === '_self') {
                            source.arrayItemDef = {
                                _id: `${item._id}_item`,
                                type: 'Object',
                                nodeId: item.nodeId,
                                dataPath: `${item.dataPath}[]`,
                                dataPathSegs: [...item.dataPathSegs],
                                objDef: selfObject.definition ? this.processSchemaItems(selfObject.definition, item.nodeId, []) : []
                            };
                        }
                    }
                }
                // Finally try direct definition
                else if (item.definition) {
                    const selfObject = item.definition[0];
                    if (selfObject && selfObject.key === '_self') {
                        source.arrayItemDef = {
                            _id: `${item._id}_item`,
                            type: 'Object',
                            nodeId: item.nodeId,
                            dataPath: `${item.dataPath}[]`,
                            dataPathSegs: [...item.dataPathSegs],
                            objDef: selfObject.definition ? this.processSchemaItems(selfObject.definition, item.nodeId, []) : []
                        };
                    }
                }
            }

            // Process schema if it exists
            if (item.schema) {
                source.objDef = [];
                this.processSchemaItems(item.schema, item.nodeId, source.objDef);
            }

            sources.push(source);
        }

        this.sources = sources;
        return sources;
    }

    private processSchemaItems(schema: any[], nodeId: string, result: SourceItem[]): SourceItem[] {
        for (const item of schema) {
            const source: SourceItem = {
                _id: item._id || `${nodeId}_${item.key}`,
                type: this.normalizeType(item.type),
                key: item.key,
                name: item.name || item.key || this.getLastPathSegment(item.dataPath),
                dataPath: item.dataPath || item.name || item.key,
                dataPathSegs: item.dataPathSegs || (item.dataPath ? item.dataPath.split('.') : [item.name || item.key]),
                nodeId: nodeId
            };

            if (item.type === 'KeyValPair') {
                source.type = 'Object';
                source.objDef = this.processKeyValPairRefData(item.refData);
            }
            else if (item.type === 'Buffer') {
                source.type = 'String';
            }
            else if (item.type === 'Object' && item.refData?.definition) {
                source.objDef = [];
                this.processSchemaItems(item.refData.definition, nodeId, source.objDef);
            }
            else if (item.type === 'Object' && item.schema) {
                source.objDef = [];
                this.processSchemaItems(item.schema, nodeId, source.objDef);
            }
            else if (item.type === 'Array') {
                source.arrayItemType = 'Object';
                // Try to find array definition in schema first
                if (item.schema) {
                    const selfObject = item.schema[0];
                    if (selfObject && selfObject.key === '_self') {
                        source.arrayItemDef = {
                            _id: `${item._id}_item`,
                            type: 'Object',
                            nodeId: nodeId,
                            dataPath: `${item.dataPath}[]`,
                            dataPathSegs: [...(item.dataPathSegs || [])],
                            objDef: selfObject.schema ? this.processSchemaItems(selfObject.schema, nodeId, []) : []
                        };
                    }
                }
                // Try refData next
                else if (item.refData?.definition) {
                    const arrayDef = item.refData.definition.find(d => d.type === 'Array');
                    if (arrayDef?.definition) {
                        const selfObject = arrayDef.definition[0];
                        if (selfObject && selfObject.key === '_self') {
                            source.arrayItemDef = {
                                _id: `${item._id}_item`,
                                type: 'Object',
                                nodeId: nodeId,
                                dataPath: `${item.dataPath}[]`,
                                dataPathSegs: [...(item.dataPathSegs || [])],
                                objDef: selfObject.definition ? this.processSchemaItems(selfObject.definition, nodeId, []) : []
                            };
                        }
                    }
                }
                // Finally try direct definition
                else if (item.definition) {
                    const selfObject = item.definition[0];
                    if (selfObject && selfObject.key === '_self') {
                        source.arrayItemDef = {
                            _id: `${item._id}_item`,
                            type: 'Object',
                            nodeId: nodeId,
                            dataPath: `${item.dataPath}[]`,
                            dataPathSegs: [...(item.dataPathSegs || [])],
                            objDef: selfObject.definition ? this.processSchemaItems(selfObject.definition, nodeId, []) : []
                        };
                    }
                }
            }

            result.push(source);
        }
        return result;
    }

    private processKeyValPairRefData(refData: any[]): SourceItem[] {
        if (!refData) return [];

        return refData.map(item => ({
            _id: `${item.key}_id`,
            type: this.normalizeType(item.type),
            key: item.key,
            name: item.name || item.key,
            dataPath: item.key,
            dataPathSegs: [item.key],
            nodeId: 'KeyValPair'
        }));
    }

    private normalizeType(type: string): string {
        switch (type) {
            case 'KeyValPair':
                return 'Object';
            case 'Buffer':
                return 'String';
            default:
                return type;
        }
    }

    private getArrayItemType(item: any): string {
        if (item.schema?.[0]?.type) {
            return item.schema[0].type;
        }
        return 'String';
    }

    private processArrayItemDefinition(item: any): any {
        if (item.type === 'Object' && item.schema) {
            return {
                type: item.type,
                objDef: this.processObjectDefinition(item.schema)
            };
        }
        return null;
    }

    private processObjectDefinition(schema: any[]): SourceItem[] {
        const objDef: SourceItem[] = [];
        for (const item of schema) {
            const def: SourceItem = {
                _id: item._id,
                type: item.type,
                dataPath: item.dataPath,
                dataPathSegs: item.dataPath.split('.'),
                nodeId: item.nodeId
            };

            if (item.type === 'Object' && item.schema) {
                def.objDef = this.processObjectDefinition(item.schema);
            } else if (item.type === 'Array' && item.schema) {
                def.arrayItemType = this.getArrayItemType(item);
                const arrayItemDef = this.processArrayItemDefinition(item.schema[0]);
                if (arrayItemDef) {
                    def.arrayItemDef = arrayItemDef;
                }
            }

            objDef.push(def);
        }
        return objDef;
    }

    private getLastPathSegment(dataPath: string | undefined): string {
        if (!dataPath) return '';
        const segments = dataPath.split('.');
        return segments[segments.length - 1];
    }

    // Array notation handling methods
    convertToDisplayNotation(value: string): string {
        return value?.replace(/\[#\]/g, '[]') || '';
    }

    convertToStorageNotation(value: string): string {
        return value?.replace(/\[\]/g, '[#]') || '';
    }

    // Get source structure
    getSourceStructure(): SourceItem[] {
        return this.sources || [];
    }
} 