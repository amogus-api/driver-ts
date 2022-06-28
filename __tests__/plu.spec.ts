import * as speedapi from "../src/index";
import { createDummyLinks } from "../src/transport/universal";

describe("Partial list updates", () => {
    const repr = new speedapi.repr.List(new speedapi.repr.Int(1), 1);

    test("append", async () => {
        const [a, b] = createDummyLinks();
        const arr = [1, 2, 3];
        const expected = [2, 3];
        Object.assign(arr, { partial: "append", count: 2 });
        Object.assign(expected, { partial: "append", count: 2 });

        await repr.write(a, arr);
        await a.flush();
        expect(await repr.read(b)).toEqual(expected);
    });

    test("prepend", async () => {
        const [a, b] = createDummyLinks();
        const arr = [1, 2, 3];
        const expected = [1, 2];
        Object.assign(arr, { partial: "prepend", count: 2 });
        Object.assign(expected, { partial: "prepend", count: 2 });

        await repr.write(a, arr);
        await a.flush();
        expect(await repr.read(b)).toEqual(expected);
    });

    test("insert", async () => {
        const [a, b] = createDummyLinks();
        const arr = [1, 2, 3, 4];
        const expected = [2, 3];
        Object.assign(arr, { partial: "insert", index: 1, count: 2 });
        Object.assign(expected, { partial: "insert", index: 1, count: 2 });

        await repr.write(a, arr);
        await a.flush();
        expect(await repr.read(b)).toEqual(expected);
    });

    test("remove", async () => {
        const [a, b] = createDummyLinks();
        const arr = [1, 2, 3, 4];
        const expected = [] as number[];
        Object.assign(arr, { partial: "remove", index: 1, count: 2 });
        Object.assign(expected, { partial: "remove", index: 1, count: 2 });

        await repr.write(a, arr);
        await a.flush();
        expect(await repr.read(b)).toEqual(expected);
    });
});
