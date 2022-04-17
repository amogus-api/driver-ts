import * as amogus from "../src/index";
import { createDummyLinks } from "../src/transport/universal";

describe("Atomic data type representation", () => {
    test("Int(1)", async () => {
        const [a, b] = createDummyLinks();
        const repr = new amogus.repr.Int(1);

        const values = [0, 1, 123, 255];
        for(const val of values) {
            await repr.write(a, val);
            expect(await repr.read(b)).toEqual(val);
        }
    });

    test("Int(4)", async () => {
        const [a, b] = createDummyLinks();
        const repr = new amogus.repr.Int(4);

        const values = [0, 1, 123, 255, 256, 10000, 65535, 65536, 10000000];
        for(const val of values) {
            await repr.write(a, val);
            expect(await repr.read(b)).toEqual(val);
        }
    });

    test("BigInt(16) (no polyfill)", async () => {
        const [a, b] = createDummyLinks();
        const repr = new amogus.repr.BigInteger(16);

        const values = [
            BigInt(1) << BigInt(80),
            BigInt(1) << BigInt(90),
            BigInt(1) << BigInt(100),
        ];
        for(const val of values) {
            await repr.write(a, val);
            expect(await repr.read(b)).toEqual(val);
        }
    });

    test("BigInt(16) (0x polyfill)", async () => {
        const [a, b] = createDummyLinks();
        amogus.repr.bigIntPolyfillMode = "0x";
        const repr = new amogus.repr.BigInteger(16);

        // emulate polyfill
        const source = BigInt;
        // @ts-expect-error polyfills break standards
        global.BigInt = (x: string) => source(x);

        const values = [
            BigInt(1) << BigInt(80),
            BigInt(1) << BigInt(90),
            BigInt(1) << BigInt(100),
        ];
        for(const val of values) {
            await repr.write(a, val);
            expect(await repr.read(b)).toEqual(val);
        }

        global.BigInt = source;
        amogus.repr.bigIntPolyfillMode = "none";
    });

    test("BigInt(16) (radix polyfill)", async () => {
        const [a, b] = createDummyLinks();
        amogus.repr.bigIntPolyfillMode = "radix";
        const repr = new amogus.repr.BigInteger(16);

        // emulate polyfill
        const source = BigInt;
        // @ts-expect-error polyfills break standards
        global.BigInt = (x: string, n?: number) => {
            expect([16, undefined]).toContain(n);
            return n ? source("0x" + x) : source(x);
        };

        const values = [
            BigInt(1) << BigInt(80),
            BigInt(1) << BigInt(90),
            BigInt(1) << BigInt(100),
        ];
        for(const val of values) {
            await repr.write(a, val);
            expect(await repr.read(b)).toEqual(val);
        }

        global.BigInt = source;
        amogus.repr.bigIntPolyfillMode = "none";
    });

    test("Str()", async () => {
        const [a, b] = createDummyLinks();
        const repr = new amogus.repr.Str();

        const values = ["hi", "hello world", "aboba", "amogus", "i like turtles"];
        for(const val of values) {
            await repr.write(a, val);
            expect(await repr.read(b)).toEqual(val);
        }
    });

    test("Bool()", async () => {
        const [a, b] = createDummyLinks();
        const repr = new amogus.repr.Bool();

        const values = [false, true];
        for(const val of values) {
            await repr.write(a, val);
            expect(await repr.read(b)).toEqual(val);
        }

        // test truthy values other than "1"
        await a.write(Buffer.from([2]));
        expect(await repr.read(b)).toEqual(true);
        await a.write(Buffer.from([100]));
        expect(await repr.read(b)).toEqual(true);
    });

    test("List()", async () => {
        const [a, b] = createDummyLinks();
        const repr = new amogus.repr.List(new amogus.repr.Int(4), 1);

        const values = [
            [0, 1],
            [1, 2],
            [123, 456],
            [123, 456, 789],
            [123, 456, 789, 101112],
        ];
        for(const val of values) {
            await repr.write(a, val);
            expect(await repr.read(b)).toEqual(val);
        }
    });

    test("Bin()", async () => {
        const [a, b] = createDummyLinks();
        const repr = new amogus.repr.Bin();

        const values = [
            Uint8Array.from([0, 1]),
            Uint8Array.from([1, 2]),
            Uint8Array.from([123, 231]),
            Uint8Array.from([123, 231, 76]),
            Uint8Array.from([123, 231, 76, 53]),
        ];
        for(const val of values) {
            await repr.write(a, val);
            expect(await repr.read(b)).toEqual(val);
        }
    });
});
