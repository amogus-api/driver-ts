import * as amogus from "amogus-driver";
import * as api from "./globalMethod_output/ts/index";

describe("Global method invocation", () => {
    let serverAskCaptcha = false;
    const { client, server } = amogus.transport.universal.createDummyPair(api.specSpace);
    const clientSession = api.bind(client);

    server.subscribe(async (event) => {
        if(!(event instanceof amogus.session.InvocationSessionEvent))
            return;
        if(!(event.method instanceof api.Echo))
            return;

        if(serverAskCaptcha) {
            const { code } = await event.confirm(new api.Captcha(), { url: "https://example.com/amogus.png" });
            if(code === "amogus")
                await event.return({ str: `${event.params.str} return` });
            else
                await event.error(api.ErrorCode.validation_failed, "Invalid captcha");
        } else {
            await event.return({ str: `${event.params.str} return` });
        }
    });


    test("normal return", async () => {
        serverAskCaptcha = false;
        const { str } = await clientSession.echo({ str: "Hello, World!" });
        expect(str).toEqual("Hello, World! return");
    });


    test("confirmation request", async () => {
        serverAskCaptcha = true;

        const { str } = await clientSession.echo({ str: "Hello, World!" }, async (conf) => {
            if(conf instanceof api.Captcha) {
                expect(conf.request!.url).toEqual("https://example.com/amogus.png");
                return { code: "amogus" };
            }
        });

        expect(str).toEqual("Hello, World! return");
    });


    test("error return", async () => {
        serverAskCaptcha = true;

        try {
            await clientSession.echo({ str: "Hello, World!" }, async (conf) => {
                if(conf instanceof api.Captcha) {
                    expect(conf.request!.url).toEqual("https://example.com/amogus.png");
                    return { code: "not amogus" };
                }
            });
        } catch(ex) {
            expect(ex).toEqual({ code: api.ErrorCode.validation_failed, message: "Invalid captcha" });
        }
    });
});
