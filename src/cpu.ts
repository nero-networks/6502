import { microcode, OpCode } from "./isa.js";
import { Memory } from "./memory.js";

export type Byte = number;
export type Word = number;

export type Reg = 'A' | 'X' | 'Y';
export type Reg16 = 'PC' | 'SP';

export class Cpu {
    HLT = true;
    BUS: Byte;

    PC: Word;
    SP: Byte;

    I: Byte;
    A: Byte;
    X: Byte;
    Y: Byte;

    flags = { n: false, v: false, ' ': true, b: false, d: false, i: false, z: false, c: false };

    microcode: Record<Byte, OpCode>;

    started: number;
    stopped: number;
    get uptime() { return (this.stopped || Date.now()) - this.started; }

    constructor(protected mem: Memory) {
        this.microcode = microcode(this, mem);
    }

    reset() {
        this.SP = 0xFF;

        this.A = this.X = this.Y = this.BUS = 0;

        Object.keys(this.flags).forEach(k => this.flags[k] = k === ' ');

        this.stopped = undefined;
        this.started = Date.now();

        this.PC = this.mem.layout.reset;
        this.microcode[0x4C].exec(); // JMP_a

        if (this.HLT) {
            this.HLT = false;
            this.run();
        }
    }

    run() {
        do {
            this.I = this.fetch();
            this.microcode[this.I].exec();
        } while (!this.HLT);
    }

    halt() {
        this.stopped = Date.now();
        this.HLT = true;
        this.BUS = 0xFF;
    }

    fetch(): Byte {
        return this.mem.read(this.PC++);
    }

    load(reg: Reg, value: Byte) {
        this[reg] = value;
        this.flags.n = value < 0;
        this.flags.z = value === 0;
    }

    store(reg: Reg, add: Word) {
        this.mem.write(add, this[reg]);
    }

    push(...bytes: Byte[]) {
        for (const value of bytes) {
            if (this.SP === this.mem.layout.stack) throw new Error('stack overflow');
            this.mem.write(this.mem.layout.stack + this.SP, value);
            this.SP--;
        }
    }

    pop() {
        if (this.SP === this.mem.layout.stack + 0xFF) throw new Error('stack underflow');
        this.SP++;
        return this.mem.read(this.mem.layout.stack + this.SP);
    }

    compare(reg: Reg, value: Byte) {
        const res = this[reg] - value;
        this.flags.n = res < 0;
        this.flags.z = res === 0;
        this.flags.c = res >= 0;
    }

    signed(value: Byte, base: 0xFF | 0xFFFF) {
        if (value > base / 2) value = -1 * (base - value + 1);
        return value;
    }

    status() {
        const hex = (val: number, pad: number) => '0x' + val.toString(16).padStart(pad, '0').toUpperCase();
        console.log('-------------------------------');
        console.log('Cpu:');
        console.log(`    HLT    : ${this.HLT}`);
        console.log(`    Uptime : ${this.uptime}ms`);
        for (const k of ['PC']) {
            console.log(`    ${k.padEnd(7)}: ${hex(this[k], 4)}`);
        }
        for (const k of ['SP', 'BUS']) {
            console.log(`    ${k.padEnd(7)}: ${hex(this[k], 2)}`);
        }
        console.log(`    Regs   : ${['I', 'A', 'X', 'Y'].map(k => `${k}:${hex(this[k], 2)}`).join(' ')}`);
        console.log(`    Flags  : ${Object.keys(this.flags).join(' ')}`);
        console.log(`             ${Object.values(this.flags).map(v => v ? 1 : 0).join(' ')}`);

        console.log('\nMemory:');
        this.mem.dump();
    }
}
