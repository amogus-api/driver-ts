import * as fs from "fs";
import * as amogus from "../src/index";
import { TlsClient, TlsListener } from "../src/transport/node";
import * as api from "./globalMethod_output/ts/index";

describe("Node TLS", () => {
    test("TLS", async () => {
        // set up a server
        const listener = new TlsListener(api.$specSpace, {
            key: fs.readFileSync("__tests__/certs/server.key"),
            cert: fs.readFileSync("__tests__/certs/server.cert"),
            port: 1234,
            rejectUnauthorized: false,
        }, (session) => {
            session.subscribe(async (event) => {
                // listen to echo() invocations
                if(!(event instanceof amogus.InvocationEvent))
                    return;
                const method = event.method;
                if(!(method instanceof api.Echo))
                    return;

                // return a response
                await method.return({ str: `${method.params!.str} return` });
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
        await listener.close();
        await client.$close();
    });
});