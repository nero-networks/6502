import * as fs from 'node:fs';
import { Byte, Word } from "./cpu";
import { microcode, OpCode } from "./isa";

type Inst = { label: string, addr: Word, data: string[], opcode: OpCode & { code: Byte; }; };
export default function compile(code: string) {
    if (!code.trim().endsWith('HLT')) code += '\nRTS';

    const opcodes: Record<string, OpCode & { code: Byte; }> = {};
    Object.entries(microcode(null, null)).forEach(e => {
        opcodes[e[1].name] = { ...e[1], code: parseInt(e[0]) } as OpCode & { code: Byte; };
    });

    const addressMode = (data: string[]) => {
        const value = data[0];
        let mode = '';
        if (value.includes('#')) mode = '#';
        else if (value.startsWith('(')) mode = 'i';
        else if (value.length > 3) mode = 'a';
        else if (value.length) mode = 'z';

        if (data[1]) mode += data[1][0];
        return mode ? '_' + mode : mode;
    };

    const instructions: Inst[] = [];
    let addr = 0;
    let label: string;
    for (let line of code.split('\n').map(l => l.split(';')[0].trim()).filter(l => l)) {
        if (!line) continue;
        const l = line.match(/^([a-z\.][a-z0-9\-\._]+):.*$/)?.[1];
        if (l) {
            label = l;
            continue;
        };

        const [ins] = line.match(/.*?([A-Z]{3})/).slice(1).map(s => s.trim());
        const data = line.substring(line.indexOf(ins) + 3).split(',').map(s => s.trim());

        const name = ins + addressMode(data);
        const opcode = opcodes[name];
        if (opcode) {
            if (!opcode.instruction)
                throw new Error(`unimplemented opcode: 0x${opcode.code.toString(16)} (${opcode.name})`);

            instructions.push({ label, addr, opcode, data });
            addr += 1 + opcode.bytes;
            label = undefined;
        } else throw new Error('unknown opcode: ' + name);
    }

    const labels: Record<string, Word> = {};
    instructions.filter(ins => ins.label).forEach(ins => labels[ins.label] = ins.addr);

    const bytes = [];
    for (const { opcode, data, addr } of instructions) {
        bytes.push(opcode.code);

        if (opcode.bytes > 0) {
            let int = 0;
            if (labels[data[0]]) {
                int = labels[data[0]] - addr - 2;
                if (int < 0) int = 0xFFFF + int;
            } else {
                let value = data[0].replaceAll(/[#\(\)]/g, '');
                if (value.startsWith('0') && value.length > 1) value = '0o' + value.substring(1);
                if (value.startsWith('$')) value = '0x' + value.substring(1);
                int = parseInt(value);
            }

            for (let i = 0; i < opcode.bytes; i++) {
                bytes.push((int >> 8 * i) & 0xFF);
            }
        }
    }
    return new Uint8Array(bytes);
}

if (process.argv[1] === __filename) {
    const code = fs.readFileSync(process.argv[2]).toString();
    const stream = fs.createWriteStream(process.argv[3]);
    stream.write(compile(code));
    stream.close();
}

