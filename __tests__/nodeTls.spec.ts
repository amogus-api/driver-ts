import * as fs from "fs";
import * as amogus from "../src/index";
import { TlsClient, TlsListener } from "../src/transport/node";
import * as api from "./globalMethod_output/ts/index";

function delay(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
}

describe("Node TLS", () => {
    test("TLS", async () => {
        let closed = false;
        // set up a server
        const listener = new TlsListener(api.$specSpace, {
            key: fs.readFileSync("__tests__/certs/server.key"),
            cert: fs.readFileSync("__tests__/certs/server.cert"),
            port: 1234,
            rejectUnauthorized: false,
        }, (session: amogus.Session<ReturnType<typeof api.$specSpace>>) => {
            const server = new amogus.Server(session, { });

            server.onInvocation("echo", async (method, _state) => {
                await method.return({ str: `${method.params.str} return` });
            });
            server.onClose((_state) => {
                closed = true;
            });
        });

        // create client
        const client = api.$bind(new TlsClient(api.$specSpace, {
            host: "localhost",
            port: 1234,
            rejectUnauthorized: false,
        }));

        // call echo()
        const result = await client.echo({ str: "hello" });
        expect(result.str).toBe("hello return");

        // close
        await client.$close();
        await delay(200);
        expect(closed).toBe(true);
        await listener.close();
    });
});