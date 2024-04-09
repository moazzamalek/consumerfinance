const { Actor } = require("apify");
const { PlaywrightCrawler, Dataset } = require("crawlee");

Actor.main(async () => {
    const { router } = require("./routes.js");
    const startUrls = [
        "https://www.consumerfinance.gov/rules-policy/final-rules/",
        "https://www.consumerfinance.gov/rules-policy/rules-under-development/",
    ];

    // const proxyConfiguration = await Actor.createProxyConfiguration();

    const crawler = new PlaywrightCrawler({
        // proxyConfiguration,
        maxConcurrency: 3,
        launchContext: {
            launchOptions: { javaScriptEnabled: false },
        },

        maxRequestRetries: 5,
        requestHandler: router,
        requestHandlerTimeoutSecs: 300,
        navigationTimeoutSecs: 300,
    });

    await crawler.run(startUrls);
    await Dataset.exportToCSV("OUTPUT");
    await Dataset.exportToJSON("OUTPUT");
});
