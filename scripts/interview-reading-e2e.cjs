/* eslint-disable @typescript-eslint/no-require-imports -- Shared Node browser QA. */
const assert = require("node:assert/strict");
const { mkdir } = require("node:fs/promises");

exports.verifyInterviewReading = async (browser, baseURL, output) => {
  await mkdir(output, { recursive: true });
  for (const width of [390, 768, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion: "reduce" });
    await context.route("**/api/**", route => route.fulfill({ json: {} }));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${baseURL}/mobile-native-e2e?scene=interview-reading`, { waitUntil: "networkidle" });
    const list = page.getByTestId("interview-question-list");
    const detail = page.getByTestId("interview-question-detail");
    assert.equal(await list.isVisible(), true);
    assert.equal(await detail.isVisible(), width >= 1024);
    assert.equal(await list.getByTestId("interview-filters").getAttribute("open"), null);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `${output}/interview-calm-library-${width}.png` });
    if (width >= 1024) {
      const top = await detail.locator("#study-answer").boundingBox();
      assert.ok(top.y < 650, "reference answer should begin in the first viewport");
    }
    const question = list.getByRole("button").filter({ hasText: "Case：产品怎么定价" }).first();
    await question.click();
    await detail.waitFor({ state: "visible" });
    await page.screenshot({ path: `${output}/interview-calm-reader-${width}.png` });
    assert.equal(await detail.locator("textarea").count(), 0);
    assert.ok((await detail.innerText()).includes("这是用于验证排版的模拟文本"));
    await detail.getByRole("button", { name: "下一题 →", exact: true }).click();
    assert.ok((await detail.locator("h1").innerText()).includes("布局测试 4"));
    await detail.getByRole("button", { name: "← 上一题", exact: true }).click();
    assert.ok((await detail.locator("h1").innerText()).includes("布局测试 3"));
    if (width < 1024) {
      await detail.getByRole("button", { name: "← 返回题目列表", exact: true }).click();
      await list.waitFor({ state: "visible" });
      await page.goForward();
      await detail.waitFor({ state: "visible" });
      assert.ok((await detail.locator("h1").innerText()).includes("布局测试 3"));
      await detail.getByRole("button", { name: "← 返回题目列表", exact: true }).click();
    }
    await list.getByLabel("搜索题库", { exact: true }).fill("不存在的测试关键词");
    await list.getByText("没有找到匹配的问题", { exact: true }).waitFor();
    await list.getByRole("button", { name: "清除筛选", exact: true }).click();
    await list.getByLabel("面试岗位").selectOption("fixture-target");
    assert.equal(await list.getByRole("button", { name: /布局测试/ }).count(), 1);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log("interview-reading-e2e: 390/768/1024/1440px passed");
};
