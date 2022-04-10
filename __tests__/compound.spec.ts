import * as amogus from "../src/index";
import * as api from "./compound_output/ts/index";

function randomColor() {
    return {
        r: Math.round(Math.random() * 255),
        g: Math.round(Math.random() * 255),
        b: Math.round(Math.random() * 255),
    };
}

describe("Compound", () => {
    test("Color", async () => {
        const serializer = new amogus.Serializer(api.ColorSpec);

        for(let i = 0; i < 10; i++) {
            const color = randomColor();
            const buf = await serializer.serialize(color);
            expect(buf).toEqual(Buffer.from([color.r, color.g, color.b]));
        }
    });

    test("TwoColors", async () => {
        const serializer = new amogus.Serializer(api.TwoColorsSpec);

        for(let i = 0; i < 10; i++) {
            const first = randomColor();
            const second = randomColor();

            const buf = await serializer.serialize({ first, second });
            const val = await serializer.deserialize(buf);

            expect(val).toEqual({ first, second });
        }
    });

    test("MaybeTwoColors", async () => {
        const serializer = new amogus.Serializer(api.MaybeTwoColorsSpec);

        for(let i = 0; i < 10; i++) {
            const first = randomColor();
            const second = Math.random() > 0.5 ? randomColor() : undefined;

            const buf = await serializer.serialize(second === undefined ? { first } : { first, second });
            const val = await serializer.deserialize(buf);

            expect(val).toEqual({ first, second });
        }
    });
});
