import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
    providedIn: 'root'
})
export class TargetStructureService {
    private targetStructure: any[] = [];

    constructor(private http: HttpClient) { }

    getTargetStructure(): any[] {
        return this.targetStructure;
    }

    setTargetStructure(structure: any[]) {
        this.targetStructure = structure;
    }

    // Add any additional methods for target structure manipulation
    // For example: addTarget, removeTarget, updateTarget, etc.
} 