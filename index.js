const puppeteer = require("puppeteer");
const readline = require("readline");
const fs = require("fs");

const PHONE_NUMBER_INPUT_SELECTOR = "input#inlineFormInput";
const PHONE_NUMBER_SUBMIT_BUTTON_SELECTOR =
  "form.send-code button[type='submit']";

const SMS_CODE_INPUT_SELECTOR = "form.validate-code input";
const SMS_CODE_SUBMIT_BUTTON_SELECTOR = "form.validate-code button";

const QUESTION_TEXT_SELECTOR = "h3.mobile-padding-question";
const ANSWERS_SELECTOR = "#answers .answer-wrapper";
const NEXT_QUESTION_BUTTON_SELECTOR = "#next-question";

const DECISION_SELECTOR = ".decision";
const DECISION_BUTTON_SELECTOR =
  ".btn.btn-primary.game-button.game-button-slot";

const BUBBLE_CONTAINER_SELECTOR = ".row.bubble-row";
const BUBBLE_SELECTOR = ".circle";

const LOSE_RESTART_BUTTON_CONTAINER_SELECTOR = ".lose";
const RESTART_BUTTON_SELECTOR = "#lose";

const ANSWERS = JSON.parse(fs.readFileSync("./answers.json"));

process.on("exit", () => {
  fs.writeFileSync("./answers.json", JSON.stringify(ANSWERS));
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = question =>
  new Promise((resolve, reject) =>
    rl.question(question, answer => rl.pause() && resolve(answer))
  );

const wait = time =>
  new Promise((resolve, reject) => setTimeout(resolve, time));

const getRandomInteger = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const waitForElement = async (page, selector, timeout = 500) => {
  try {
    const element = await page.evaluate(
      selector => document.querySelector(selector),
      selector
    );
    if (element) {
      return;
    } else {
      await wait(timeout);
      return waitForElement(page, selector, timeout);
    }
  } catch (e) {
    await wait(timeout);
    return waitForElement(page, selector, timeout);
  }
};

async function run() {
  const browser = await puppeteer.launch({
    headless: false
  });

  const page = await browser.newPage();

  await page.goto("https://game.energy.ch");

  await waitForElement(page, PHONE_NUMBER_INPUT_SELECTOR, 100);

  const number = await ask(
    "What is your phone number? (format: +41XXXXXXXXX): "
  );
  await page.click(PHONE_NUMBER_INPUT_SELECTOR);
  await page.keyboard.type(number);
  await page.click(PHONE_NUMBER_SUBMIT_BUTTON_SELECTOR);

  await waitForElement(page, SMS_CODE_INPUT_SELECTOR, 100);

  const code = await ask("What is the 4 digit code you received? ");
  await page.click(SMS_CODE_INPUT_SELECTOR);
  await page.keyboard.type(code);
  await page.click(SMS_CODE_SUBMIT_BUTTON_SELECTOR);

  await waitForElement(page, QUESTION_TEXT_SELECTOR, 100);
  answerQuestion(page);
}

async function answerQuestion(page) {
  try {
    const question = await page.evaluate(
      selector => document.querySelector(selector).textContent,
      QUESTION_TEXT_SELECTOR
    );

    const answers = await page.evaluate(
      selector =>
        Array.from(document.querySelectorAll(selector)).map(
          node => node.childNodes[2].textContent
        ),
      ANSWERS_SELECTOR
    );

    const answerIndex =
      question in ANSWERS
        ? answers.findIndex(e => e === ANSWERS[question])
        : await ask(
            `Question/Answer unknown!
Question: ${question}
Answers:
${answers.map((answer, index) => `${answer} (${index})`).join("\n")}

Enter the answer index:`
          );

    //save answer
    ANSWERS[question] = answers[answerIndex];

    await page.click(ANSWERS_SELECTOR + `:nth-child(${answerIndex + 1}) input`);

    await page.click(NEXT_QUESTION_BUTTON_SELECTOR);

    await wait(250);

    return answerQuestion(page);
  } catch (e) {
    //check if we lost
    if (
      await page.evaluate(
        selector => document.querySelector(selector),
        LOSE_RESTART_BUTTON_CONTAINER_SELECTOR
      )
    ) {
      await page.click(LOSE_RESTART_BUTTON_CONTAINER_SELECTOR + " button");

      await wait(250);
      return answerQuestion(page);
    }

    //nope so its the decision screen
    await waitForElement(page, DECISION_SELECTOR, 100);

    let text = await page.evaluate(
      selector => document.querySelector(selector).childNodes[0].textContent,
      DECISION_SELECTOR
    );
    if (
      text ===
      "Du hast die erste Hürde gepackt. Um welchen Preis möchtest du spielen?"
    ) {
      await page.click(DECISION_BUTTON_SELECTOR);

      await waitForElement(page, BUBBLE_CONTAINER_SELECTOR, 100);
      await waitForElement(page, BUBBLE_SELECTOR, 100);

      const selector =
        BUBBLE_SELECTOR + `:nth-child(${getRandomInteger(1, 12)}) > img`;

      await page.evaluate(
        selector => document.querySelector(selector).click(),
        selector
      );

      await wait(1000);

      if (
        await page.evaluate(
          selector => document.querySelector(selector),
          RESTART_BUTTON_SELECTOR
        )
      ) {
        await page.click(RESTART_BUTTON_SELECTOR);

        await waitForElement(page, QUESTION_TEXT_SELECTOR, 100);

        return answerQuestion(page);
      } else {
        console.log("YOU WON!");

        return;
      }
    }
  }
}

async function quit() {
  browser.close();
  rl.close();
}

run();
