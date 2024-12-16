import { Byte, Cpu, Word } from "./cpu";
import { Memory } from "./memory";

export class OpCode {
    private type: string;
    private reg: string;
    public bytes: 0 | 1 | 2;

    constructor(
        public name: string,
        public instruction: (addr: Word, val: Byte) => void,
        private cpu: Cpu,
        private mem: Memory
    ) {
        if (name.includes('_')) {
            const [type, reg] = name.split('_').pop().split('');
            this.type = type;
            this.reg = reg;
        }

        this.bytes = this.type === 'a' || this.type === 'i' && !this.reg ? 2 : this.type ? 1 : 0;
    }

    exec() {
        const addr = this.fetch();
        const val = this.type === '#' ? addr & 0xFF : this.mem.read(addr);
        this.instruction(addr, val);
    }

    fetch(): Word {
        if (!this.type) return;
        let addr: Word;

        if (this.type === 'i') {
            addr = this.cpu.fetch();
            if (!this.reg) return addr & 0xFF | this.cpu.fetch() << 8;
            if (this.reg === 'x') return this.mem.read(addr + this.cpu.X) & 0xFF | this.mem.read(addr + this.cpu.X + 1) << 8;
            if (this.reg === 'Y') return (this.mem.read(addr) & 0xFF | this.mem.read(addr)) + this.cpu.Y;
        }
        if (this.type === '#' || this.type === 'z') addr = this.cpu.fetch();
        if (this.type === 'a') addr = this.cpu.fetch() & 0xFF | this.cpu.fetch() << 8;
        if (this.reg === 'x') addr += this.cpu.X;
        if (this.reg === 'Y') addr += this.cpu.Y;
        return addr;
    }
};

export const microcode = (c: Cpu, m: Memory) => {
    const
        f = c?.flags,
        byte = (val: Byte | Word) => val > 0xFF ? val -= 0xFF : val < 0 ? val += 0xFF : val,
        add = (val: Byte, num: Byte) => byte(val += num),
        sub = (val: Byte, num: Byte) => byte(val -= num),

        asl = (val: Byte) => { f.c = bit(val, 7); val = byte(val <<= 1); numflags(val); return val; },
        rol = (val: Byte) => { const v = f.c ? 1 : 0; return asl(val) | v; },
        lsr = (val: Byte) => { f.c = bit(val, 7); val = byte(val >>= 1); numflags(val); return val; },
        ror = (val: Byte) => { const v = f.c ? 1 : 0; return lsr(val) | v; },

        br = (addr: Word) => { c.PC += c.signed(addr, 0xFFFF); },
        jsr = (addr: Word) => { c.push(c.PC >> 8, c.PC & 0xFF); c.PC = addr; },
        rts = () => { c.PC = c.pop() | c.pop() << 8; },

        bit = (val: Byte, pos: number) => !!((val >> pos) & 1),
        numflags = (val: Byte) => { c.flags.n = val < 0; c.flags.z = val === 0; },
        flags = (val?: Byte) => {
            const keys = Object.keys(c.flags);
            if (val) val.toString(2).padStart(8, '0').split('').forEach((f, i) => c.flags[keys[i]] = f === '1');
            else return eval('0b' + keys.map(k => c.flags[k] ? '1' : '0').join(''));
        };

    const inst = {
        HLT: (addr: Word, val: Byte) => { c.halt(); },
        NOP: (addr: Word, val: Byte) => { },

        // Logical and arithmetic commands:
        ORA: (addr: Word, val: Byte) => { c.load('A', c.A | val); },
        AND: (addr: Word, val: Byte) => { c.load('A', c.A & val); },
        EOR: (addr: Word, val: Byte) => { c.load('A', c.A ^ val); },
        ADC: (addr: Word, val: Byte) => { c.load('A', add(c.A, val)); },
        SBC: (addr: Word, val: Byte) => { c.load('A', sub(c.A, val)); },
        CMP: (addr: Word, val: Byte) => { c.compare('A', val); },
        CPX: (addr: Word, val: Byte) => { c.compare('X', val); },
        CPY: (addr: Word, val: Byte) => { c.compare('Y', val); },

        DEC: (addr: Word, val: Byte) => { m.write(addr, sub(val, 1)); },
        DEX: (addr: Word, val: Byte) => { c.load('X', c.X - 1); },
        DEY: (addr: Word, val: Byte) => { c.load('Y', c.Y - 1); },

        INC: (addr: Word, val: Byte) => { m.write(addr, add(val, 1)); },
        INX: (addr: Word, val: Byte) => { c.load('X', c.X + 1); },
        INY: (addr: Word, val: Byte) => { c.load('Y', c.Y + 1); },

        ASL: (addr: Word, val: Byte) => addr ? m.write(addr, asl(val)) : c.load('A', asl(c.A)),
        ROL: (addr: Word, val: Byte) => addr ? m.write(addr, rol(val)) : c.load('A', rol(c.A)),
        LSR: (addr: Word, val: Byte) => addr ? m.write(addr, lsr(val)) : c.load('A', lsr(c.A)),
        ROR: (addr: Word, val: Byte) => addr ? m.write(addr, ror(val)) : c.load('A', ror(c.A)),

        // Move commands:
        LDA: (addr: Word, val: Byte) => { c.load('A', val); },
        STA: (addr: Word, val: Byte) => { c.store('A', addr); },
        LDX: (addr: Word, val: Byte) => { c.load('X', val); },
        STX: (addr: Word, val: Byte) => { c.store('X', addr); },
        LDY: (addr: Word, val: Byte) => { c.load('Y', val); },
        STY: (addr: Word, val: Byte) => { c.store('Y', addr); },
        TAX: (addr: Word, val: Byte) => { c.X = c.A; },
        TXA: (addr: Word, val: Byte) => { c.A = c.X; },
        TAY: (addr: Word, val: Byte) => { c.Y = c.A; },
        TYA: (addr: Word, val: Byte) => { c.A = c.Y; },
        TSX: (addr: Word, val: Byte) => { c.X = c.SP; },
        TXS: (addr: Word, val: Byte) => { c.SP = c.X; },
        PLA: (addr: Word, val: Byte) => { c.A = c.pop(); },
        PHA: (addr: Word, val: Byte) => { c.push(c.A); },
        PLP: (addr: Word, val: Byte) => { flags(c.pop()); },
        PHP: (addr: Word, val: Byte) => { c.push(flags()); },

        // Jump/Flag commands:
        BPL: (addr: Word, val: Byte) => { !f.n && br(addr); },
        BMI: (addr: Word, val: Byte) => { f.n && br(addr); },
        BVC: (addr: Word, val: Byte) => { !f.v && br(addr); },
        BVS: (addr: Word, val: Byte) => { f.v && br(addr); },
        BCC: (addr: Word, val: Byte) => { !f.c && br(addr); },
        BCS: (addr: Word, val: Byte) => { f.c && br(addr); },
        BNE: (addr: Word, val: Byte) => { !f.z && br(addr); },
        BEQ: (addr: Word, val: Byte) => { f.z && br(addr); },

        BRK: (addr: Word, val: Byte) => { jsr(m.layout.interupt); f.b = f.i = true; },
        RTI: (addr: Word, val: Byte) => { f.b = f.i = false; rts(); },
        JSR: (addr: Word, val: Byte) => { jsr(addr); },
        RTS: (addr: Word, val: Byte) => { rts(); },
        JMP: (addr: Word, val: Byte) => { c.PC = addr; },

        BIT: null,

        CLC: (addr: Word, val: Byte) => { f.c = false; },
        SEC: (addr: Word, val: Byte) => { f.c = true; },
        CLD: (addr: Word, val: Byte) => { f.d = false; },
        SED: (addr: Word, val: Byte) => { f.d = true; },
        CLI: (addr: Word, val: Byte) => { f.i = false; },
        SEI: (addr: Word, val: Byte) => { f.i = true; },
        CLV: (addr: Word, val: Byte) => { f.v = false; },

        // Illegal opcodes:
        SLO: null,
        RLA: null,
        SRE: null,
        RRA: null,
        SAX: null,
        LAX: null,
        DCP: null,
        ISC: null,
        ANC: null,
        ALR: null,
        ARR: null,
        XAA: null,
        AXS: null,
        AHX: null,
        SHY: null,
        SHX: null,
        TAS: null,
        LAS: null,
    };

    const op = (name: string) =>
        new OpCode(name, inst[name.split('_')[0]], c, m);

    return {
        0x02: op('HLT'),
        0xEA: op('NOP'),

        // Logical and arithmetic commands:
        0x09: op('ORA_#'),
        0x05: op('ORA_z'),
        0x15: op('ORA_zx'),
        0x01: op('ORA_ix'),
        0x11: op('ORA_iy'),
        0x0D: op('ORA_a'),
        0x1D: op('ORA_ax'),
        0x19: op('ORA_ay'),

        0x29: op('AND_#'),
        0x25: op('AND_z'),
        0x35: op('AND_zx'),
        0x21: op('AND_ix'),
        0x31: op('AND_iy'),
        0x2D: op('AND_a'),
        0x3D: op('AND_ax'),
        0x39: op('AND_ay'),

        0x49: op('EOR_#'),
        0x45: op('EOR_z'),
        0x55: op('EOR_zx'),
        0x41: op('EOR_ix'),
        0x51: op('EOR_iy'),
        0x4D: op('EOR_a'),
        0x5D: op('EOR_ax'),
        0x59: op('EOR_ay'),

        0x69: op('ADC_#'),
        0x65: op('ADC_z'),
        0x75: op('ADC_zx'),
        0x61: op('ADC_ix'),
        0x71: op('ADC_iy'),
        0x6D: op('ADC_a'),
        0x7D: op('ADC_ax'),
        0x79: op('ADC_ay'),

        0xE9: op('SBC_#'),
        0xE5: op('SBC_z'),
        0xF5: op('SBC_zx'),
        0xE1: op('SBC_ix'),
        0xF1: op('SBC_iy'),
        0xED: op('SBC_a'),
        0xFD: op('SBC_ax'),
        0xF9: op('SBC_ay'),

        0xC9: op('CMP_#'),
        0xC5: op('CMP_z'),
        0xD5: op('CMP_zx'),
        0xC1: op('CMP_ix'),
        0xD1: op('CMP_iy'),
        0xCD: op('CMP_a'),
        0xDD: op('CMP_ax'),
        0xD9: op('CMP_ay'),

        0xE0: op('CPX_#'),
        0xC4: op('CPX_z'),
        0xEC: op('CPX_a'),

        0xC0: op('CPY_#'),
        0xE4: op('CPY_z'),
        0xCC: op('CPY_a'),

        0xC6: op('DEC_z'),
        0xD6: op('DEC_x'),
        0xCE: op('DEC_a'),
        0xDE: op('DEC_ax'),

        0xCA: op('DEX'),
        0x88: op('DEY'),

        0xE6: op('INC_z'),
        0xF6: op('INC_zx'),
        0xEE: op('INC_a'),
        0xFE: op('INC_ax'),

        0xE8: op('INX'),
        0xC8: op('INY'),

        0x0A: op('ASL'),
        0x06: op('ASL_z'),
        0x16: op('ASL_zx'),
        0x0E: op('ASL_a'),
        0x1E: op('ASL_ax'),

        0x2A: op('ROL'),
        0x26: op('ROL_z'),
        0x36: op('ROL_zx'),
        0x2E: op('ROL_a'),
        0x3E: op('ROL_ax'),

        0x4A: op('LSR'),
        0x46: op('LSR_z'),
        0x56: op('LSR_zx'),
        0x4E: op('LSR_a'),
        0x5E: op('LSR_ax'),

        0x6A: op('ROR'),
        0x66: op('ROR_z'),
        0x76: op('ROR_zx'),
        0x6E: op('ROR_a'),
        0x7E: op('ROR_ax'),

        // Move commands:
        0xA9: op('LDA_#'),
        0xA5: op('LDA_z'),
        0xB5: op('LDA_zx'),
        0xA1: op('LDA_ix'),
        0xB1: op('LDA_iy'),
        0xAD: op('LDA_a'),
        0xBD: op('LDA_ax'),
        0xB9: op('LDA_ay'),

        0x85: op('STA_z'),
        0x95: op('STA_zx'),
        0x81: op('STA_ix'),
        0x91: op('STA_iy'),
        0x8D: op('STA_a'),
        0x9D: op('STA_ax'),
        0x99: op('STA_ay'),

        0xA2: op('LDX_#'),
        0xA6: op('LDX_z'),
        0xB6: op('LDX_zy'),
        0xAE: op('LDX_a'),
        0xBE: op('LDX_ay'),

        0x86: op('STX_z'),
        0x96: op('STX_zy'),
        0x8E: op('STX_a'),

        0xA0: op('LDY_#'),
        0xA4: op('LDY_z'),
        0xB4: op('LDY_zx'),
        0xAC: op('LDY_a'),
        0xBC: op('LDY_ax'),

        0x84: op('STY_z'),
        0x94: op('STY_zx'),
        0x8C: op('STY_a'),


        0xAA: op('TAX'),
        0x8A: op('TXA'),
        0xA8: op('TAY'),
        0x98: op('TYA'),
        0xBA: op('TSX'),
        0x9A: op('TXS'),
        0x68: op('PLA'),
        0x48: op('PHA'),
        0x28: op('PLP'),
        0x08: op('PHP'),

        // Jump/Flag commands:
        0x10: op('BPL_a'),
        0x30: op('BMI_a'),
        0x50: op('BVC_a'),
        0x70: op('BVS_a'),
        0x90: op('BCC_a'),
        0xB0: op('BCS_a'),
        0xD0: op('BNE_a'),
        0xF0: op('BEQ_a'),

        0x00: op('BRK'),
        0x40: op('RTI'),
        0x20: op('JSR_a'),
        0x60: op('RTS'),
        0x4C: op('JMP_a'),
        0x6C: op('JMP_i'),

        0x24: op('BIT'),
        0x2C: op('BIT_a'),

        0x18: op('CLC'),
        0x38: op('SEC'),
        0xD8: op('CLD'),
        0xF8: op('SED'),
        0x58: op('CLI'),
        0x78: op('SEI'),
        0xB8: op('CLV'),

        // Illegal opcodes:
        0x07: op('SLO_z'),
        0x17: op('SLO_zx'),
        0x03: op('SLO_ix'),
        0x13: op('SLO_iy'),
        0x0F: op('SLO_a'),
        0x1F: op('SLO_ax'),
        0x1B: op('SLO_ay'),

        0x27: op('RLA_z'),
        0x37: op('RLA_zx'),
        0x23: op('RLA_ix'),
        0x33: op('RLA_iy'),
        0x2F: op('RLA_a'),
        0x3F: op('RLA_ax'),
        0x3B: op('RLA_ay'),

        0x47: op('SRE_z'),
        0x57: op('SRE_zx'),
        0x43: op('SRE_ix'),
        0x53: op('SRE_iy'),
        0x4F: op('SRE_a'),
        0x5F: op('SRE_ax'),
        0x5B: op('SRE_ay'),

        0x67: op('RRA_z'),
        0x77: op('RRA_zx'),
        0x63: op('RRA_ix'),
        0x73: op('RRA_iy'),
        0x6F: op('RRA_a'),
        0x7F: op('RRA_ax'),
        0x7B: op('RRA_ay'),

        0x87: op('SAX_z'),
        0x97: op('SAX_zy'),
        0x83: op('SAX_ix'),
        0x8F: op('SAX_a'),

        0xA7: op('LAX_z'),
        0xB7: op('LAX_zy'),
        0xA3: op('LAX_ix'),
        0xB3: op('LAX_iy'),
        0xAF: op('LAX_a'),
        0xBF: op('LAX_ay'),

        0xC7: op('DCP_z'),
        0xD7: op('DCP_zx'),
        0xC3: op('DCP_ix'),
        0xD3: op('DCP_iy'),
        0xCF: op('DCP_a'),
        0xDF: op('DCP_ax'),
        0xDB: op('DCP_ay'),

        0xE7: op('ISC_z'),
        0xF7: op('ISC_zx'),
        0xE3: op('ISC_ix'),
        0xF3: op('ISC_iy'),
        0xEF: op('ISC_a'),
        0xFF: op('ISC_ax'),
        0xFB: op('ISC_ay'),

        0x0B: op('ANC_#'),
        0x2B: op('ANC_#'),
        0x4B: op('ALR_#'),
        0x6B: op('ARR_#'),
        0x8B: op('XAA_#'),
        0xAB: op('LAX_#'),
        0xCB: op('AXS_#'),
        0xEB: op('SBC_#'),
        0x93: op('AHX_iy'),
        0x9F: op('AHX_ay'),

        0x9C: op('SHY_ax'),
        0x9E: op('SHX_ay'),
        0x9B: op('TAS_ay'),
        0xBB: op('LAS_ay'),
    };
};
