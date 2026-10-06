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
    // The exact reported prompts must show actual questions, not job metadata.
    if (width >= 1024) {
      assert.equal(await detail.getByTestId("interview-prompt-text").innerText(), "用约90秒介绍自己，并说明哪些真实经历支持你胜任当前岗位。");
      assert.equal(await detail.locator("h1").innerText(), "自我介绍");
    }
    await list.getByRole("button").filter({ hasText: "现金流与折现率" }).first().click();
    const cashflow = await detail.getByTestId("interview-prompt-text").innerText();
    assert.equal(cashflow, "面试官给你两套现金流：一套在债务偿付前，另一套已扣利息并考虑净借款。你分别用什么折现率？算出来是企业价值还是股权价值？");
    assert.equal(await detail.locator("h1").innerText(), "现金流与折现率");
    assert.ok(!(await detail.innerText()).includes("2028届条件准备目标"));
    await page.screenshot({ path: `${output}/interview-prompt-cashflow-${width}.png` });
    if (width < 1024) { await detail.getByRole("button", { name: "← 返回题目列表", exact: true }).click(); await list.waitFor({ state: "visible" }); }
    await list.getByRole("button").filter({ hasText: "车辆总拥有成本" }).first().click();
    const assumptions = await detail.getByTestId("interview-prompt-text").innerText();
    for (const text of ["电车也无残值", "忽略融资、折现", "充电设施投入", "0.15欧元"]) assert.ok(assumptions.includes(text));
    await page.screenshot({ path: `${output}/interview-prompt-assumptions-${width}.png` });
    if (width < 1024) { await detail.getByRole("button", { name: "← 返回题目列表", exact: true }).click(); await list.waitFor({ state: "visible" }); }
    const question = list.getByRole("button").filter({ hasText: "Case：产品怎么定价" }).first();
    await question.click();
    await detail.waitFor({ state: "visible" });
    await page.screenshot({ path: `${output}/interview-calm-reader-${width}.png` });
    assert.equal(await detail.locator("textarea").count(), 0);
    assert.ok((await detail.innerText()).includes("这是用于验证排版的模拟文本"));
    const answerSection = detail.locator("#study-answer");
    const explanation = detail.locator("#study-thinking");
    assert.ok((await answerSection.innerText()).includes("这是用于验证排版的模拟文本"));
    assert.ok(!(await answerSection.innerText()).includes("使用记录能说明工具被采用"));
    assert.equal(await explanation.getAttribute("open"), null);
    const historyLength = await page.evaluate(() => history.length);
    await detail.getByRole("navigation", { name: "题目学习章节", exact: true }).getByRole("button", { name: "思路拆解讲解", exact: true }).click();
    assert.ok((await explanation.innerText()).includes("使用记录能说明工具被采用"));
    assert.equal(await page.evaluate(() => history.length), historyLength);
    assert.ok(!(await explanation.innerText()).includes("先区分观察、解释和证据"));
    const supplement = detail.getByTestId("study-history");
    assert.equal(await supplement.getAttribute("open"), null);
    await supplement.locator("summary").click();
    assert.ok((await supplement.innerText()).includes("未随所选答案版本同步修订"));
    assert.ok((await supplement.innerText()).includes("先区分观察、解释和证据"));
    assert.equal(await page.evaluate(() => history.length), historyLength);
    await page.screenshot({ path: `${output}/interview-history-supplement-${width}.png` });
    await supplement.locator("summary").focus();
    await page.keyboard.press("Enter");
    assert.equal(await supplement.getAttribute("open"), null);
    await page.screenshot({ path: `${output}/interview-answer-explanation-${width}.png` });
    await explanation.locator("summary").focus();
    await page.keyboard.press("Enter");
    assert.equal(await explanation.getAttribute("open"), null);
    await detail.getByRole("navigation", { name: "题目学习章节", exact: true }).getByRole("button", { name: "思路拆解讲解", exact: true }).click();
    assert.equal(await explanation.getAttribute("open"), "");
    await detail.getByRole("button", { name: "下一题 →", exact: true }).click();
    assert.equal(await detail.locator("#study-thinking").getAttribute("open"), null);
    assert.ok((await detail.getByTestId("interview-prompt-text").innerText()).includes("布局测试 4"));
    await detail.getByRole("button", { name: "← 上一题", exact: true }).click();
    assert.ok((await detail.getByTestId("interview-prompt-text").innerText()).includes("布局测试 3"));
    if (width < 1024) {
      await detail.getByRole("button", { name: "← 返回题目列表", exact: true }).click();
      await list.waitFor({ state: "visible" });
      await page.goForward();
      await detail.waitFor({ state: "visible" });
      assert.ok((await detail.getByTestId("interview-prompt-text").innerText()).includes("布局测试 3"));
      await detail.getByRole("button", { name: "← 返回题目列表", exact: true }).click();
    }
    await list.getByLabel("搜索题库", { exact: true }).fill("不存在的测试关键词");
    await list.getByText("没有找到匹配的问题", { exact: true }).waitFor();
    await list.getByRole("button", { name: "清除搜索与筛选", exact: true }).click();
    await list.getByLabel("搜索题库", { exact: true }).fill("旧版讲解");
    await list.getByRole("button").filter({ hasText: "推理题：旧版讲解" }).first().click();
    await detail.waitFor({ state: "visible" });
    assert.ok((await detail.locator("#study-answer").innerText()).includes("还未整理出完整的标准答案"));
    assert.ok(!(await detail.locator("#study-answer").innerText()).includes("短摘要"));
    await detail.getByRole("button", { name: "阅读现有讲解 →", exact: true }).click();
    assert.equal(await detail.getByTestId("study-history").count(), 0);
    assert.ok((await detail.locator("#study-thinking").innerText()).includes("先区分观察、解释和证据"));
    assert.ok((await detail.locator("#study-thinking").innerText()).includes("先构造两个满足题设的世界"));
    assert.ok((await detail.locator("#study-thinking").innerText()).includes("这个短摘要不能替代完整的考官回答"));
    await page.screenshot({ path: `${output}/interview-legacy-explanation-${width}.png` });
    if (width < 1024) {
      await detail.getByRole("button", { name: "← 返回题目列表", exact: true }).click();
      await list.waitFor({ state: "visible" });
    }
    await list.getByLabel("搜索题库", { exact: true }).fill("");
    await list.getByLabel("面试岗位").selectOption("fixture-target");
    assert.equal(await list.getByRole("button", { name: /布局测试/ }).count(), 1);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log("interview-reading-e2e: 390/768/1024/1440px passed");
};
