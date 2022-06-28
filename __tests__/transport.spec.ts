import { Server } from "../src/index";
import * as node from "../src/transport/node";
import * as universal from "../src/transport/universal";
import * as api from "./entity_output/ts/index";

describe("Transport layer", () => {
    test("Built-in Node transport crash", () => {
        try {
            new node.TlsClient(api.$specSpace, {});
            fail("should crash");
        } catch { }
        try {
            new node.TlsServer(api.$specSpace, {});
            fail("should crash");
        } catch { }
        try {
            new node.TlsListener(api.$specSpace, {}, undefined);
            fail("should crash");
        } catch { }
    });

    test("Simultaneous transactions should not interfere with each other", async () => {
        const { client, server } = universal.createDummyPair(api.$specSpace);
        const session = api.$bind(client);
        const serverApi = new Server(server, {});

        serverApi.onInvocation("global_echo", async (method, _state) => {
            await method.return({ str: method.params.str });
        });

        expect(await Promise.all([
            session.globalEcho({ str: "hello" }),
            session.globalEcho({ str: "world" }),
            session.globalEcho({ str: "unit testing" }),
        ])).toEqual([
            { str: "hello" },
            { str: "world" },
            { str: "unit testing" },
        ]);

        expect(await Promise.all([
            session.globalEcho({ str: "a" }),
            session.globalEcho({ str: "b" }),
        ])).toEqual([
            { str: "a" },
            { str: "b" },
        ]);
    });
});
