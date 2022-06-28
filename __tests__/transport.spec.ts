import * as speedapi from "../src/index";
import * as node from "../src/transport/node";
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

    test("Flush after segment write", async () => {
        class TestLink extends speedapi.Duplex {
            flushed = false;

            async close() { }
            async write() { }
            async read(_n: number) { return Uint8Array.from([]); }
            override async flush() {
                this.flushed = true;
            }
        }

        const link = new TestLink();
        expect(link.flushed).toBe(false);

        // sending the segment manually because `session.global_echo` awaits a response
        const method = new api.GlobalEcho();
        method.params = { str: "hi" };
        await new speedapi.segment.InvokeMethodSegment(0, method).write(link);

        expect(link.flushed).toBe(true);
    });
});
