import * as fs from 'node:fs';
import { Cpu } from './cpu';
import { Memory } from './memory';

const mem = new Memory();
mem.map(mem.layout.rom, fs.readFileSync('./code/rom.bin'));
mem.map(0x0220, fs.readFileSync('./code/test.bin'));

const cpu = new Cpu(mem);
cpu.reset();
cpu.status();
