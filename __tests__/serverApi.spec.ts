import * as amogus from "../src/index";
import * as api from "./entity_output/ts/index";

function delay(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
}

describe("Nice server API", () => {
    const { client, server } = amogus.transport.universal.createDummyPair<ReturnType<typeof api.$specSpace>>(api.$specSpace);
    const clientSession = api.$bind(client);
    const serverSession = new amogus.Server(server, { suffix: "!" });

    serverSession.onInvocation("Test.static_echo", async (method, state) => {
        const params = method.params;
        await method.return({ str: params.str + state.suffix });
        return { suffix: state.suffix + "!" };
    });
    serverSession.onInvocation("Test.validation_echo", async (method, _) => {
        const params = method.params;
        await method.return({ str: params.str });
    });
    serverSession.onInvocation("Test.limit_echo", async (method, _) => {
        const params = method.params;
        await method.return({ str: params.str });
    });


    test("State preservation", async () => {
        expect(await clientSession.Test.staticEcho({ str: "Hello" })).toEqual({ str: "Hello!" });
        expect(await clientSession.Test.staticEcho({ str: "Hello" })).toEqual({ str: "Hello!!" });
        expect(await clientSession.Test.staticEcho({ str: "Hello" })).toEqual({ str: "Hello!!!" });
    });


    test("Params validation", async () => {
        const cases = [
            [true, "Helloo"],
            [true, "12345"],
            [false, "No."],
            [false, "Noooooooooooooooooooooooooooo."],
            [true, "AAAAAAAAAA"],
            [false, "Nooooooo.... maybe? just kidding"],
            [true, "Testing"],
        ] as [boolean, string][];

        for(const [valid, str] of cases) {
            try {
                const { str: result } = await clientSession.Test.validationEcho({ str });
                expect(result).toEqual(str);
                if(!valid)
                    fail("Expected validation failure");
            } catch(err) {
                if(valid)
                    fail("Expected validation success");
                expect((err as {code: number}).code).toEqual(clientSession.ErrorCode.validation_failed);
            }
        }
    });


    test("Rate limiting", async () => {
        expect(await clientSession.Test.limitEcho({ str: "Hello" })).toEqual({ str: "Hello" });
        try {
            await clientSession.Test.limitEcho({ str: "Hello" });
            fail("Expected error");
        } catch(err) {
            expect(err).toEqual({ code: clientSession.ErrorCode.rate_limit, message: "rate limit exceeded" });
        }
        await delay(1000);
        expect(await clientSession.Test.limitEcho({ str: "Hello" })).toEqual({ str: "Hello" });
    });
});
