import * as amogus from "../src/index";
import { createDummyLinks } from "../src/transport/universal";

describe("Atomic data type validation", () => {
    test("Int(1)[val]", async () => {
        const [a, b] = createDummyLinks();
        const repr = new amogus.repr.Int(1, { val: [10, 100] });
        
        const values = [0, 1, 50, 123, 255];
        for(const val of values) {
            await repr.write(a, val);
            const value = await repr.read(b);
            expect(value).toEqual(val);
            const valid = val >= 10 && val <= 100;
            expect(repr.validate(value)).toEqual(valid);
        }
    });

    test("Str[len]", async () => {
        const [a, b] = createDummyLinks();
        const repr = new amogus.repr.Str({ len: [2, 7] });

        const values = ["hi", "hello world", "aboba", "amogus", "i like turtles"];
        for(const val of values) {
            await repr.write(a, val);
            const value = await repr.read(b);
            expect(value).toEqual(val);
            const valid = val.length >= 2 && val.length <= 7;
            expect(repr.validate(value)).toEqual(valid);
        }
    });

    test("Str[match]", async () => {
        const [a, b] = createDummyLinks();
        const repr = new amogus.repr.Str({ match: /[a-z]+/i });

        const values = ["hi", "heLLo", "123", "!@#$%^&*()_+"];
        for(const val of values) {
            await repr.write(a, val);
            const value = await repr.read(b);
            expect(value).toEqual(val);
            const valid = value.match(/^[a-z]+$/i) !== null;
            expect(repr.validate(value)).toEqual(valid);
        }
    });

    test("Bool", async () => {
        const [a, b] = createDummyLinks();
        const repr = new amogus.repr.Bool();

        const values = [false, true];
        for(const val of values) {
            await repr.write(a, val);
            const value = await repr.read(b);
            expect(value).toEqual(val);
            expect(repr.validate(value)).toEqual(true);
        }
    });
});
