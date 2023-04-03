import { MinimatchOptions } from './index.js';
export type MMRegExp = RegExp & {
    _src?: string;
    _glob?: string;
};
export declare const parse: (options: MinimatchOptions, pattern: string, debug: (...a: any[]) => void) => false | string;
//# sourceMappingURL=_parse.d.ts.map