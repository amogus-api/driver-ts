import * as speedapi from "../src/index";
import { createDummyLinks } from "../src/transport/universal";

describe("Atomic data type validation", () => {
    test("Int(1)[val]", async () => {
        const [a, b] = createDummyLinks();
        const repr = new speedapi.repr.Int(1, { val: [10, 100] });

        const values = [0, 1, 50, 123, 255];
        for(const val of values) {
            await repr.write(a, val);
            const value = await repr.read(b);
            expect(value).toEqual(val);
            const valid = val >= 10 && val <= 100;
            expect(repr.findError(value) === null).toEqual(valid);
        }
    });

    test("BigInt(16)[val]", async () => {
        const [a, b] = createDummyLinks();
        const repr = new speedapi.repr.BigInteger(16, { val: [BigInt(10), BigInt(100)] });

        const values = [
            BigInt(5), BigInt(10), BigInt(50), BigInt(123), BigInt(255),
            BigInt(1) << BigInt(80),
            BigInt(1) << BigInt(90),
            BigInt(1) << BigInt(100),
        ];
        for(const val of values) {
            await repr.write(a, val);
            const value = await repr.read(b);
            expect(value).toEqual(val);
            const valid = val >= 10 && val <= 100;
            expect(repr.findError(value) === null).toEqual(valid);
        }
    });

    test("Str[len]", async () => {
        const [a, b] = createDummyLinks();
        const repr = new speedapi.repr.Str({ len: [2, 7] });

        const values = ["hi", "hello world", "aboba", "speedapi", "i like turtles"];
        for(const val of values) {
            await repr.write(a, val);
            const value = await repr.read(b);
            expect(value).toEqual(val);
            const valid = val.length >= 2 && val.length <= 7;
            expect(repr.findError(value) === null).toEqual(valid);
        }
    });

    test("Str[match]", async () => {
        const [a, b] = createDummyLinks();
        const repr = new speedapi.repr.Str({ match: /[a-z]+/i });

        const values = ["hi", "heLLo", "123", "!@#$%^&*()_+"];
        for(const val of values) {
            await repr.write(a, val);
            const value = await repr.read(b);
            expect(value).toEqual(val);
            const valid = value.match(/[a-z]+/i) !== null;
            expect(repr.findError(value) === null).toEqual(valid);
        }
    });

    test("Bool", async () => {
        const [a, b] = createDummyLinks();
        const repr = new speedapi.repr.Bool();

        const values = [false, true];
        for(const val of values) {
            await repr.write(a, val);
            const value = await repr.read(b);
            expect(value).toEqual(val);
            expect(repr.findError(value) === null).toEqual(true);
        }
    });

    test("List[len]", async () => {
        const [a, b] = createDummyLinks();
        const repr = new speedapi.repr.List(new speedapi.repr.Int(4), 1, { len: [0, 3] });

        const pass = [
            [],
            [257536],
            [13461, 12541],
            [84239, 418734, 184340],
        ];
        const fail = [
            [7198, 1234, 1234, 1234],
            [7458092, 29352, 89234, 454534, 345343453, 34534],
        ];

        for(const val of pass) {
            await repr.write(a, val);
            const value = await repr.read(b);
            expect(repr.findError(value) === null).toEqual(true);
        }
        for(const val of fail) {
            await repr.write(a, val);
            const value = await repr.read(b);
            expect(repr.findError(value) === null).toEqual(false);
        }
    });

    test("Bin[len]", async () => {
        const [a, b] = createDummyLinks();
        const repr = new speedapi.repr.Bin({ len: [0, 3] });

        const pass = [
            Buffer.from([]),
            Buffer.from([12]),
            Buffer.from([23, 23]),
            Buffer.from([134, 98, 36]),
        ];
        const fail = [
            Buffer.from([122, 123, 214, 73]),
            Buffer.from([15, 72, 61, 241, 2, 165, 87, 4]),
        ];

        for(const val of pass) {
            await repr.write(a, val);
            const value = await repr.read(b);
            expect(repr.findError(value) === null).toEqual(true);
        }
        for(const val of fail) {
            await repr.write(a, val);
            const value = await repr.read(b);
            expect(repr.findError(value) === null).toEqual(false);
        }
    });

    test("List(Int[val])", async () => {
        const [a, b] = createDummyLinks();
        const repr = new speedapi.repr.List(new speedapi.repr.Int(4, { val: [10, 100] }), 1);

        const values = [
            [true, [30, 50, 70, 90]],
            [true, [10, 20, 30, 40]],
            [true, [15, 21, 15, 62]],
            [false, [0, 1, 2, 3]],
            [false, [316, 1493, 1920, 123]],
            [false, [6, 3, 8, 1, 8, 4, 3, 4]],
        ] as [boolean, number[]][];

        for(const [pass, val] of values) {
            await repr.write(a, val);
            const value = await repr.read(b);
            expect(repr.findError(value) === null).toEqual(pass);
        }
    });
});
