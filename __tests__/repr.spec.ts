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
});
