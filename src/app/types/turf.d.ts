// src/app/types/turf.d.ts
declare module '@turf/turf' {
    export function point(coordinates: number[]): any;
    export function booleanPointInPolygon(point: any, polygon: any): boolean;
    export function polygonToLine(polygon: any): any;
    export function pointToLineDistance(point: any, line: any): number;
    export function distance(point1: any, point2: any): number;
    export function coordAll(feature: any): number[][];
    export function simplify(geojson: any, options?: any): any;
    export function booleanPointOnLine(point: any, line: any): boolean;
    export function nearestPointOnLine(line: any, point: any): any;
}