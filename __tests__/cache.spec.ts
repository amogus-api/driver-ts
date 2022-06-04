import * as speedapi from "../src/index";
import { createDummyPair } from "../src/transport/universal";
import * as api from "./cache_output/ts/index";

describe("Client-side caching", () => {
    const { client, server } = createDummyPair<ReturnType<typeof api.$specSpace>>(api.$specSpace);
    const clientSession = api.$bind(client);
    const clientCache = new speedapi.Cache(client);
    const serverSession = api.$bind(server);
    const serverApi = new speedapi.Server(server, { userId: BigInt(123) });

    // serverApi.debug = true;

    const articleDb = { } as { [id: string]: {
        author: bigint;
        paragraphs: { title: string, content: string }[];
        liked_by: bigint[];
    } };

    serverApi.onInvocation("Article.create", async (method, state) => {
        const articleId = BigInt(Math.round(Math.random() * 10000));
        articleDb[articleId.toString()] = {
            author: state.userId,
            paragraphs: method.params.paragraphs,
            liked_by: [],
        };
        await method.return({ id: articleId });
    });

    serverApi.onInvocation("Article.get", async (method, _state) => {
        const id = method.params.id;
        const article = articleDb[id.toString()];
        if(!article) {
            await method.error(api.ErrorCode.invalid_id, "Invalid article ID");
            return;
        }
        await method.return({
            entity: new serverSession.Article({ ...article, id }) as speedapi.ValuedEntity,
        });
    });

    serverApi.onInvocation("Article.update", async (method, _state) => {
        const id = method.entityId!;
        const fields = method.params.entity.value;

        if("author" in fields) {
            await method.error(api.ErrorCode.invalid_entity, "Cannot change `author`");
            return;
        }
        if("liked_by" in fields) {
            await method.error(api.ErrorCode.invalid_entity, "Cannot change `liked_by`");
            return;
        }

        // check if the update is a partial one
        const article = articleDb[id.toString()];
        const pars = fields.paragraphs as speedapi.repr.ListOrUpdate<typeof articleDb[string]["paragraphs"][number]>;
        if("partial" in pars) {
            const partial = pars.partial;
            if(partial === "append") article.paragraphs.push(...pars);
            if(partial === "prepend") article.paragraphs.unshift(...pars);
            if(partial === "insert") article.paragraphs.splice(pars.index, 0, ...pars);
            if(partial === "remove") article.paragraphs.splice(pars.index, pars.count);
        } else {
            article.paragraphs = pars;
        }

        await method.return({});
    });

    serverApi.onInvocation("trigger_update", async (method, _state) => {
        await method.return({ });

        setTimeout(() => {
            const article = articleDb[artId.toString()];
            article.paragraphs.push(serverPar);
            const upd = [...article.paragraphs] as speedapi.repr.ListUpdate<typeof serverPar>;
            upd.partial = "append";
            upd.count = 1;
            void server.pushEntity(new serverSession.Article({
                id: artId,
                paragraphs: upd,
            }) as speedapi.ValuedEntity);
        }, 500);
    });

    // CLIENT

    let artId = BigInt(0);
    const initialParagraphs = [
        { title: "Paragraph 1", content: "This is paragraph 1." },
        { title: "Paragraph two", content: "This is paragraph 2, as demonstrated by its title." },
        { title: "Paragraph 4", content: "This is the fourth paragraph. The third one is skipped intentionally and will be added later." },
    ];
    const insertedPar = { title: "Paragraph 3", content: "This is the third paragraph that got added later" };
    const serverPar = { title: "Paragraph 5", content: "This is the fifth paragraph that got added by the server later" };

    test("create article", async () => {
        const { id } = await clientSession.Article.create({ paragraphs: initialParagraphs });
        artId = id;
    });

    test("get article", async () => {
        const article = await clientCache.get(clientSession.Article, artId);
        expect(article.id).toBe(artId);
        expect(article.author).toBe(BigInt(123));
        expect(article.paragraphs).toEqual(initialParagraphs);
    });

    test("add 3rd paragraph", async () => {
        const update = [...initialParagraphs];
        update.splice(2, 0, insertedPar);
        Object.assign(update, { partial: "insert", index: 2, count: 1 });
        await clientCache.update(clientSession.Article, {
            id: artId,
            paragraphs: update,
        });
    });

    test("get article again", async () => {
        const updatedPars = [...initialParagraphs];
        updatedPars.splice(2, 0, insertedPar);
        Object.assign(updatedPars, { partial: "insert", index: 2, count: 1 });
        const article = await clientCache.get(clientSession.Article, artId);
        expect(article.id).toBe(artId);
        expect(article.author).toBe(BigInt(123));
        expect(article.paragraphs).toEqual(updatedPars);
    });

    test("receive server-side update", () => new Promise<void>((res) => {
        const updatedPars = [...initialParagraphs, serverPar];
        updatedPars.splice(2, 0, insertedPar);
        Object.assign(updatedPars, { partial: "append", count: 1 });

        const sub = clientCache.subscribe(clientSession.Article, artId, (article) => {
            expect(article.id).toBe(artId);
            expect(article.author).toBe(BigInt(123));
            expect(article.paragraphs).toEqual(updatedPars);
            clientCache.unsubscribe(sub);
            res();
        });

        void clientSession.triggerUpdate({ });
    }));
});
