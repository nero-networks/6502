import { Byte, Word } from "./cpu.js";

export interface AddHandler { read?: (add: Word) => Byte, write?: (add: Word, value: Byte) => void; };

export class Memory {
    private mapped = {};

    layout = {
        stack: 0x0100,
        periferals: 0xF700,
        rom: 0xFD00,
        nmi: 0xFFFA,
        reset: 0xFFFC,
        interupt: 0xFFFE
    };

    constructor() {
        const ram = new Uint8Array(this.layout.periferals);
        this.map(0, ram, true);
        this.map(this.layout.nmi, [0, 0]);
        this.map(this.layout.reset, [this.layout.rom & 0xFF, this.layout.rom >> 8]);
        this.map(this.layout.interupt, [0, 0]);
    }

    read(add: Word) {
        return this.mapped[add]?.read(add) || 0;
    }

    write(add: Word, value: Byte) {
        return this.mapped[add]?.write(add, value);
    }

    map(from: Word, to: Word, handler?: AddHandler): void;
    map(from: Word, array: Byte[], writable?: boolean): void;
    map(from: Word, array: Uint8Array, writable?: boolean): void;
    map(from: Word, toOrArray: Word | Byte[] | Uint8Array, handlerOrWritable?: AddHandler | boolean) {
        if (typeof toOrArray === 'object')
            return this.map(from, from + toOrArray.length - 1, {
                read(add: Word) { return toOrArray[add]; },
                write(add: Word, value: Byte) { if (handlerOrWritable) toOrArray[add] = value; }
            });

        const handler = handlerOrWritable as AddHandler;
        const to = toOrArray as number;
        const mapper = {
            read(add: Word) { return handler.read?.(add - from); },
            write(add: Word, value: Byte) { handler.write?.(add - from, value); }
        };
        for (let i = 0; i < to - from + 1; i++)
            this.mapped[from + i] = mapper;
    }

    dump() {
        let show = false;
        const bytes = 4;
        for (let i = 0; i < 0xFFFF; i += bytes) {
            let line = '';
            let sum = 0;
            for (let j = 0; j < bytes && i + j <= 0xFFFF; j++) {
                const byte = this.read(i + j);
                sum += byte;
                line += '0x' + byte.toString(16).padStart(2, '0').toUpperCase() + ' ';
            }
            if (!sum) {
                if (show) console.log('    ...');
                show = false;
            } else {
                show = true;
            }
            if (show) console.log('    0x' + i.toString(16).padStart(4, '0').toUpperCase() + ' : ' + line);
        }
    }
}
