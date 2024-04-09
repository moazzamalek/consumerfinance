const { Dataset, createPlaywrightRouter } = require("crawlee");
const pdfParse = require("pdf-parse");
const router = createPlaywrightRouter();
const { load } = require("cheerio");
router.addDefaultHandler(async ({ request, page, enqueueLinks, log }) => {
    const title = await page.title();
    log.info(`${title}`, { url: request.loadedUrl });
    await enqueueLinks({
        selector: ".a-btn[href*=page]",
    });
    await enqueueLinks({
        selector: "article h3 a",
        label: "detail",
    });
});
router.addHandler("detail", async ({ request, page, log }) => {
    const title = await page.title();
    log.info(`${title}`, { url: request.loadedUrl });
    const result = await page.evaluate(() => {
        let result = {
            Category: document.querySelector("a[class*=m-breadcrumbs]")
                .innerText,
            Title: document.querySelector("h1").innerText,
            MainParagraphText: document.querySelector(
                ".m-full-width-text p:first-of-type"
            ).innerText,
            Text: document.querySelector(".m-full-width-text").innerText,
            PDFs: [],
            Links: [],
        };
        let category;
        for (const el of Array.from(
            document.querySelectorAll(".m-full-width-text >*")
        )) {
            if (el.tagName == "H5" || el.tagName == "H4")
                category = el?.getAttribute("id") || el?.innerText;
            if (!category) continue;
            const link = el.querySelector("a");
            if (link) {
                const isPDF = link.href.includes(".pdf");
                const obj = {
                    linkText: link.innerText,
                    link: link.href,
                    category,
                };
                if (isPDF) result.PDFs.push(obj);
                else result.Links.push(obj);
            }
        }

        return result;
    });
    const PDFs = (
        await Promise.allSettled(
            result.PDFs.map(
                (pdf) =>
                    new Promise(async (res, rej) => {
                        try {
                            const pdfResponse = await page.request.fetch(
                                pdf.link
                            );

                            // Parse the PDF using pdf-parse
                            const pdfText = await pdfParse(
                                (
                                    await pdfResponse.body()
                                ).buffer
                            );

                            res({
                                ...pdf,
                                text: pdfText.text,
                                info: pdfText.info,
                                metadata:
                                    pdfText.metadata?._metadata ||
                                    pdfText.metadata,
                                error: null,
                            });
                        } catch (e) {
                            // console.log(e);
                            res({ ...pdf, error: e.message || e.code || true });
                        }
                    })
            )
        )
    ).map((p) => p.value);
    const Links = (
        await Promise.allSettled(
            result.Links.map(
                (link) =>
                    new Promise(async (res, rej) => {
                        try {
                            let text;
                            if (
                                link.linkText?.includes("Read it") &&
                                link.linkText?.includes("the Federal Register")
                            ) {
                                const FederalRegisterResponse =
                                    await page.request.fetch(link.link);
                                const $ = load(
                                    await FederalRegisterResponse.text()
                                );
                                text = $("#fulltext_content_area").text();
                            }
                            res({
                                ...link,
                                text,
                            });
                        } catch (e) {
                            // console.log(e);
                            res({
                                ...link,
                                error: e.message || e.code || true,
                            });
                        }
                    })
            )
        )
    ).map((p) => p.value);
    if (request.errorMessages.includes("Data item is too large")) {
        await Dataset.pushData({
            url: request.url,
            ...result,
            PDFs: PDFs.map((item) => ({
                ...item,
                text: "Please get Manually",
            })),
            Links: Links.map((item) => ({
                ...item,
                text: "Please get Manually",
            })),
        });
    }
    await Dataset.pushData({ url: request.url, ...result, PDFs, Links });
});
module.exports = { router };
