import * as amogus from "amogus-driver";
import * as api from "./entityMethod_output/ts/index";

describe("Entity method invocation", () => {
    const { client, server } = amogus.transport.universal.createDummyPair(api.$specSpace);
    const clientSession = api.$bind(client);

    // server transaction listener
    server.subscribe(async (event) => {
        // only process method invocations
        if(!(event instanceof amogus.session.InvocationSessionEvent))
            return;
        const method = event.method;

        if(method instanceof api.Test_StaticEcho)
            await method.return({ str: `${method.params!.str} return` });
        
        else if(method instanceof api.Test_DynamicEcho)
            await method.return({ str: `${method.params!.str} return (eid ${method.entityId})` });
    });

    test("static entity method", async () => {
        const { str } = await clientSession.Test.staticEcho({ str: "hi" });
        expect(str).toEqual("hi return");
    });

    test("dynamic entity method", async () => {
        const test = new clientSession.Test({ id: 123 });
        const { str } = await test.dynamicEcho({ str: "hi" });
        expect(str).toEqual("hi return (eid 123)");
    });
});
