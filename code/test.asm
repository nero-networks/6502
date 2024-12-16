LDA #$42            ; load 0x42 into A
STA $42             ; store 0x42 into 0x0042
STA $43             ; store 0x42 into 0x0043 -> address 0x4242

LDX #$21            ; load 0x21 into X
STA ($21,x)         ; store 0x42 into 0x4242

loop:               ; while(y < $42) y++
    INY             ; incr Y
    INC $4200       ; incr 0x4200
    CPY $42         ; compare Y with the value of 0x0042 (0x42)
    BNE loop        ; if Y is not 0x42 -> jump(address of INY)

TXA                 ; transfer 0x21 into A
ASL                 ; left shift A (multipy by 2)
TAX                 ; transfer A into X -> X is 0x42

PHA                 ; push A
PHP                 ; push flags
PLP                 ; pull flags
PLA                 ; pull A
NOP                 ; no op
