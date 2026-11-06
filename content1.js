// Content for phases 1-3. Markdown subset: ## , - , 1. , > , **b** , {{code}} , [t](u) , ~~~lang fences. "§" in fences renders as "$".
window.PHASES = window.PHASES || [];
const R = String.raw;

window.PHASES.push({
  id: "p1", n: 1, title: "Prompting & LLM basics", weeks: "Weeks 1-2",
  goal: "Understand what an LLM actually does, then learn to measure how much its output varies.",
  deliverable: "Write-up 'Why the same prompt gives different tests' + a versioned prompt library.",
  setup: R`## Before you start
- **Prerequisites:** Python 3.11+, Node 18+ (Phases 3 and 6: Playwright, promptfoo), Git, a GitHub account (Phase 4), and an MCP host such as Claude Code for Phase 3, a terminal. Commands are shown for Windows PowerShell; on macOS/Linux use the equivalent activate and env-var syntax.
- **Pace:** the plan assumes 8-10 hours a week. The time on each exercise is a guess; double it the first time.
- **API call budget:** variance and eval exercises make many calls (about 100 in Phase 1 exercises 2 and 3, up to 150 in Phase 6 exercise 1, 250+ in Phase 7). Free models have daily limits. Start with 2-3 runs per item, scale up once the code works, and cache results to disk.
- **Coming from Java?** Python decorators behave like annotations that wrap a function, Pydantic models are POJOs with validation, and pytest fixtures replace JUnit setup methods. If you are new to Python, work through chapters 1-9 of the official tutorial (docs.python.org/3/tutorial) first.
- **Folder layout:** one project folder for everything. Later exercises import earlier files, so use these names:

~~~text
llm.py          shared client + ask()              (phase 1)
story_to_tests.py  generate() with repair loop     (phase 2)
server.py       your MCP server                    (phase 3)
judge.py        DeepEval judge wrapper             (phase 4)
checks.py       deterministic checks on cases      (phase 4)
golden.jsonl    golden dataset                     (phase 4)
rag.py          retriever + answer()               (phase 5)
agent.py        make_agent + fake model helpers    (phase 5)
attacks.json    injection payloads                 (phase 6)
tracer.py       @traced decorator                  (phase 7)
report.py       metrics report from traces         (phase 7)
traces.jsonl    written by the tracer              (phase 7)
cache.py        optional: cache LLM calls          (below)
~~~

## One-time setup (used by every phase)
1. Install Python 3.11+ and create a project folder with a venv.
2. Get a free key at openrouter.ai and pick a model that supports **tools** (filter on the models page). Free models change often, so never hard-code one. The **API key & live checks** page in the sidebar walks you through creating a key, lists free tool-capable models, and tests your setup in the browser.
3. Set environment variables (PowerShell):

~~~powershell
python -m venv .venv; .venv\Scripts\Activate.ps1
pip install openai pydantic pytest requests
$env:LLM_API_KEY = "sk-or-..."
$env:LLM_MODEL   = "<model id from openrouter.ai/models>"
~~~

4. Create {{llm.py}} - every exercise imports it:

~~~python
import os
from openai import OpenAI

MODEL = os.getenv("LLM_MODEL")
_client = None

def get_client():
    # Created lazily so offline unit tests can import this module with no key set.
    global _client
    if _client is None:
        _client = OpenAI(base_url=os.getenv("LLM_BASE_URL", "https://openrouter.ai/api/v1"),
                         api_key=os.environ["LLM_API_KEY"],
                         timeout=30, max_retries=2)   # SDK retries 429/5xx twice; Phase 2 adds your own retry logic on top
    return _client

def ask(prompt, system=None, temperature=0.7, **kw):
    msgs = ([{"role": "system", "content": system}] if system else []) \
           + [{"role": "user", "content": prompt}]
    r = get_client().chat.completions.create(model=MODEL, messages=msgs,
                                             temperature=temperature, **kw)
    return r.choices[0].message.content
~~~

Optional {{cache.py}}: wrap {{ask}} so reruns cost nothing. Pass a different {{tag}} for each repeat run, otherwise you get the same cached text back:

~~~python
import hashlib, json, pathlib

def cached_ask(ask, path="cache.json"):
    p = pathlib.Path(path); db = json.loads(p.read_text()) if p.exists() else {}
    def run(prompt, system=None, temperature=0.7, tag=0, **kw):
        k = hashlib.sha256(json.dumps([prompt, system, temperature, tag]).encode()).hexdigest()
        if k not in db:
            db[k] = ask(prompt, system=system, temperature=temperature, **kw)
            p.write_text(json.dumps(db))
        return db[k]
    return run
~~~

Never commit your key. Add {{.env}} and {{.venv}} to {{.gitignore}}.`,
  learn: [
    { t: "What an LLM really does", md: R`## Next-token prediction
An LLM reads a sequence of **tokens** (word pieces) and outputs a probability for every possible next token. It picks one, appends it, and repeats.

- A token is roughly 3-4 English characters. Cost, speed and limits are all counted in tokens.
- The **context window** is the maximum tokens (prompt + answer) the model can see at once. Past it, text is cut or errors.
- The model has no memory between calls. Every call must carry all the context it needs.

> Tester view: the model is a function that is *probabilistic, context-sensitive and confidently wrong sometimes*. You cannot assert exact equality. You assert properties.` },
    { t: "Sampling: temperature and friends", md: R`## Why outputs differ
- **temperature** scales randomness. 0 = pick the most likely token (mostly repeatable). 1+ = more varied.
- **top_p** keeps only the smallest set of tokens whose probability adds to p.
- Even at temperature 0, results can differ slightly between runs (hardware, batching, provider changes). Treat "temperature 0" as *low variance*, not *deterministic*.
- **seed** is supported by some providers. It reduces variance but does not guarantee identical output.

Rule: use low temperature for extraction, classification and test-case generation. Use higher only when you want variety (e.g. brainstorming edge cases).` },
    { t: "Anatomy of a good prompt", md: R`## Six parts
1. **Role** - who the model acts as ("senior QA engineer").
2. **Task** - one clear verb ("write 5 test cases").
3. **Context** - the story, API spec, constraints.
4. **Format** - exact output shape (JSON schema, columns).
5. **Examples** - 1-3 few-shot samples of ideal output.
6. **Guardrails** - what not to do ("no invented endpoints; say UNKNOWN if unsure").

Tips:
- Put instructions first, data last, and fence data clearly (e.g. between {{<story>}} tags).
- Say what to do, not only what to avoid.
- Ask for reasoning only if you need it. For machine-read output ask for JSON only.
- Change one thing at a time, otherwise you cannot tell what helped.` },
    { t: "Few-shot and structured output", md: R`## Showing beats telling
**Zero-shot**: instructions only. **Few-shot**: instructions + examples. Examples fix format and quality bar faster than long rules.

Structured output options (best to weakest):
1. Provider JSON-schema / structured-output mode, when available.
2. JSON mode (set response_format to type json_object).
3. Prompt-only ("Return ONLY JSON matching...") plus validation and retry.

Always **validate** the result (Pydantic, JSON Schema). Never trust that the model followed the format.` },
    { t: "Why non-determinism changes testing", md: R`## From pass/fail to rates
Classic test: same input, same output, pass or fail. LLM test: same input, many possible outputs.

New habits:
- **Property assertions**: valid JSON, has 5 cases, every case has expected result, no duplicate titles.
- **Run N times**: report a pass *rate* (e.g. 9/10), not one result.
- **Pin what you can**: model id, prompt version, temperature, seed. Log them with every result.
- **Version prompts** like code. A prompt change is a code change and needs a regression run.
- **Mock the LLM** in unit tests (Phase 2) and keep a few live tests separate.` },
  ],
  exercises: [
    {
      id: "p1e1", title: "Hello, LLM: set up and call the model", time: "45 min",
      goal: "Get a working {{ask()}} helper and see raw response metadata.",
      task: R`1. Complete the "Setup for the exercises" card on this Learn tab and create {{llm.py}}.
2. Write {{hello.py}} that sends a user story and asks for 3 test case titles.
3. Print the answer, the model name used, and token usage ({{response.usage}}). You will need to look at the raw response, not only the text.
4. Run it 3 times at temperature 0 and 3 times at temperature 1. Eyeball the difference.`,
      criteria: ["{{ask()}} works with env vars, no secrets in code", "Token usage printed", "Noted 2 observed differences between temp 0 and temp 1"],
      hints: [
        "If you get a 401, the key env var is not set in this terminal session. Env vars set in PowerShell last only for that window.",
        "{{ask()}} returns only text. Call {{get_client().chat.completions.create(...)}} directly (or add a second helper) to get the whole {{r}} object so you can read {{r.usage.prompt_tokens}} and {{r.usage.completion_tokens}}.",
        "404 or 'no endpoints' usually means the model id is wrong or the free model is currently offline. Copy the id exactly from openrouter.ai/models."
      ],
      approach: "Reuse get_client() from llm.py. Call chat.completions.create directly in hello.py when you need usage, because ask() hides it.",
      solution: R`~~~python
from llm import get_client, MODEL

STORY = "As a user I can reset my password via an emailed link that expires in 15 minutes."
for temp in (0, 0, 0, 1, 1, 1):
    r = get_client().chat.completions.create(
        model=MODEL, temperature=temp,
        messages=[{"role": "user",
                   "content": "Give 3 test case titles, one per line.\n\nStory: " + STORY}])
    print("--- temp", temp, "| model", r.model, "| tokens", r.usage.prompt_tokens, "+", r.usage.completion_tokens)
    print(r.choices[0].message.content)
~~~`
    },
    {
      id: "p1e2", title: "Measure variance", time: "1.5 h",
      goal: "Turn 'it feels random' into a number.",
      task: R`1. Write 10 different prompts that generate test cases (different stories: login, cart, search, payment, API, etc.). Store them in {{prompts.json}} as a list of objects, each with an id field and a text field. Store them in {{prompts.json}} as a list of objects, each with an id field and a text field.
2. For each prompt run 5 times at temperature 0 and 5 times at 0.9.
3. Compute a similarity score between runs (suggest: Jaccard similarity on the set of words, averaged over all pairs of runs).
4. Output a table: prompt id, mean similarity at temp 0, mean similarity at temp 0.9.
5. Write 5 sentences on what you found.`,
      criteria: ["10 prompts stored in a file, not inline", "Similarity function has its own unit test", "Table printed for both temperatures", "Write-up saved as a markdown file"],
      hints: [
        "Compare *pairs*: with 5 runs there are 10 pairs. Python: {{itertools.combinations(runs, 2)}}.",
        "Comparing whole lines is too strict because tiny wording changes give 0 similarity. Tokenise to lowercase words, drop short stop-words, then use Jaccard = size of the intersection divided by size of the union (Python: len(a & b) / len(a | b)).",
        "Calls are slow and may be rate-limited. Add {{time.sleep(1)}} or use a thread pool of 3. Cache results to a JSON file so you do not pay twice while debugging the maths."
      ],
      approach: "Separate three things: (1) generating runs and saving them, (2) the similarity function (pure, unit-testable), (3) reporting. Save raw runs to disk first.",
      solution: R`~~~python
import itertools, re, json, pathlib
from llm import ask

STOP = {"the","a","an","and","or","to","of","is","in","with","user","test"}
def words(t): return {w for w in re.findall(r"[a-z0-9]+", t.lower()) if w not in STOP and len(w) > 2}
def jaccard(a, b): return 1.0 if not (a | b) else len(a & b) / len(a | b)

def spread(prompt, temp, n=5):
    runs = [words(ask(prompt, temperature=temp)) for _ in range(n)]
    sims = [jaccard(a, b) for a, b in itertools.combinations(runs, 2)]
    return sum(sims) / len(sims)

def test_jaccard():
    assert jaccard({"a","b"}, {"a","b"}) == 1.0
    assert jaccard({"a"}, {"b"}) == 0.0

if __name__ == "__main__":
    prompts = json.loads(pathlib.Path("prompts.json").read_text())
    print("id  temp0  temp0.9")
    for p in prompts:
        print(p["id"], round(spread(p["text"], 0), 2), round(spread(p["text"], 0.9), 2))
~~~

Expected finding: temp 0 is higher but rarely 1.0. Say that in your write-up.`
    },
    {
      id: "p1e3", title: "Prompt library: zero-shot vs few-shot", time: "2 h",
      goal: "Build a versioned prompt that returns valid JSON test cases and prove few-shot helps.",
      task: R`1. Create {{prompts/gen_cases.v1.txt}} (zero-shot) and {{prompts/gen_cases.v2.txt}} (with 2 examples). Put a placeholder named STORY in double curly braces where the story goes, and replace it in code before each call.
2. Output must be a JSON object with a "cases" list; each case has title, priority, steps, expected. Priority is P0, P1 or P2.
3. Write a validator (Pydantic or hand-written) that checks the shape.
4. Run each prompt version 10 times on 5 stories. Record: % valid JSON, % schema-valid, average number of cases.
5. Decide which version wins and write why.`,
      criteria: ["Both prompt versions live in files with a version in the name", "Validator rejects at least 3 kinds of bad output (not JSON, missing field, bad priority)", "Results table: v1 vs v2", "Decision documented"],
      hints: [
        "Models often wrap JSON in text or markdown fences. Extract with {{re.search(r'\\{.*\\}', raw, re.S)}} before parsing, and count 'needed extraction' as a separate stat.",
        "In few-shot examples use a *different* story than the ones you test on, otherwise the model may copy the example.",
        "Use {{typing.Literal['P0','P1','P2']}} in a Pydantic model so a bad priority fails validation automatically."
      ],
      approach: "Make the loop generic: for version in versions, for story in stories, for run in range(10): call, extract, validate, record. Then aggregate with a dict or pandas.",
      solution: R`~~~python
import re, json
from typing import Literal
from pydantic import BaseModel, ValidationError
from llm import ask

class Case(BaseModel):
    title: str
    priority: Literal["P0", "P1", "P2"]
    steps: list[str]
    expected: str
class Suite(BaseModel):
    cases: list[Case]

def parse(raw):
    m = re.search(r"\{.*\}", raw, re.S)
    if not m: return None, "no_json"
    try: obj = json.loads(m.group(0))
    except ValueError: return None, "bad_json"          # found braces but not valid JSON
    try: return Suite.model_validate(obj), "ok"
    except ValidationError: return None, "bad_schema"   # valid JSON, wrong shape

def run(version, stories, n=10):
    tpl = open(f"prompts/gen_cases.{version}.txt").read()
    out = {"ok": 0, "no_json": 0, "bad_json": 0, "bad_schema": 0, "cases": 0}
    for s in stories:
        for _ in range(n):
            suite, status = parse(ask(tpl.replace("{{STORY}}", s), temperature=0.2))
            out[status] += 1
            if suite: out["cases"] += len(suite.cases)
    total = len(stories) * n
    print(version, {k: round(v / total, 2) for k, v in out.items()})
~~~`
    },
  ],
  resources: [
    ["Prompting Guide", "https://www.promptingguide.ai"],
    ["Anthropic: prompt engineering overview", "https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview"],
    ["OpenRouter model list", "https://openrouter.ai/models"],
    ["Tokenizer playground (see tokens)", "https://platform.openai.com/tokenizer"],
  ],
});

window.PHASES.push({
  id: "p2", n: 2, title: "LLM APIs & tool calling", weeks: "Weeks 3-4",
  goal: "Call LLMs from code reliably, force structured output, let the model call your tools, and test it without paying for every run.",
  deliverable: "A CLI 'story-to-tests' with schema validation, retries, one tool, mocked unit tests and one live smoke test.",
  learn: [
    { t: "The chat completion request", md: R`## Shape of a call
A request has: **model**, **messages** (list of role + content), and options (temperature, max_tokens, tools, response_format).

Roles:
- {{system}} - rules and persona. Highest priority instructions.
- {{user}} - the input.
- {{assistant}} - earlier model replies (you send these back to keep a conversation).
- {{tool}} - results of tools the model asked you to run.

Response: {{choices[0].message}}, {{finish_reason}} (stop, length, tool_calls) and {{usage}}.

Check {{finish_reason}}: "length" means the answer was cut off, so JSON will be broken.

Anthropic's native API and OpenAI-style APIs differ in field names but follow the same idea. OpenRouter lets you use the OpenAI style for many models.` },
    { t: "Reliability: timeouts, retries, errors", md: R`## Real APIs fail
Expect: 429 (rate limit), 5xx (provider error), timeouts, empty or truncated output, model offline.

- Set a **timeout** on every call.
- **Retry with exponential backoff + jitter** on 429/5xx/timeouts only. Never retry 400/401 (your bug).
- Cap total attempts and total spend.
- Log: model, prompt version, latency, tokens, status.
- Provide a **fallback** model if the first one is down.

Tester angle: these are test targets. Can your code survive a 429? A malformed reply? An empty string? You test this with a mock.` },
    { t: "Structured output and validation", md: R`## Contract between you and the model
Treat the LLM output as untrusted input from an external service.

1. Define the schema (Pydantic model or JSON Schema).
2. Tell the model the schema.
3. Parse and validate.
4. On failure: send the validation error back and ask for a fix (**repair loop**), max 2 retries.
5. After that: fail loudly with the raw output saved for debugging.

This validate-and-repair loop is the first thing most real LLM apps need.` },
    { t: "Tool calling", md: R`## The loop
The model cannot run code. It can *ask you* to run a function.

1. You send messages plus **tool definitions** (name, description, JSON-schema parameters).
2. Model replies with {{tool_calls}} (name + JSON arguments) instead of text.
3. **You** run the function.
4. You append the result as a {{tool}} message (with the matching {{tool_call_id}}).
5. Call the model again. Repeat until it answers with plain text or you hit a step limit.

Key points:
- The tool **description** is a prompt. Vague description = wrong tool use.
- Arguments are model-generated, so **validate them** before running. Never pass them straight to a shell or SQL.
- Always set a **max steps** limit.
- Not every (free) model supports tools. Check the model's capabilities.` },
    { t: "Testing code that uses an LLM", md: R`## The test pyramid for LLM apps
- **Unit (many, fast, free)**: inject a fake LLM that returns scripted replies. Test parsing, retries, validation, tool loop.
- **Contract (some)**: saved real responses ("golden recordings") replayed in tests so format changes in your parser are caught.
- **Live smoke (few)**: 1-3 real calls marked {{@pytest.mark.live}}, run on demand or nightly. Assert only properties (valid JSON, non-empty).
- **Evals (Phase 4)**: quality measured over a dataset.

Design for testability: pass the LLM function in as a parameter ({{generate(story, llm=ask)}}) instead of importing it deep inside.` },
  ],
  exercises: [
    {
      id: "p2e1", title: "story-to-tests CLI with validation and repair", time: "2.5 h",
      goal: "A command-line tool that turns a user story into validated JSON test cases.",
      task: R`1. Create {{story_to_tests.py}}: {{python story_to_tests.py "As a user ..."}} prints JSON.
2. Define Pydantic models for Case and Suite.
3. Implement the repair loop: on invalid output, send the error back, max 2 retries.
4. Add a {{--out file.json}} option and exit code 1 if still invalid.
5. Add a timeout and basic retry on API errors (not on validation errors).`,
      criteria: ["Valid output on 3 different stories", "Repair loop proven by forcing a bad first reply (a small stub function that returns bad JSON first is enough; full tests come in Phase 2 exercise 3)", "Non-zero exit code on final failure, raw output saved", "Timeout set on API call"],
      hints: [
        "{{argparse}} gives you the CLI quickly. Keep the generate() function separate from main() so you can test generate() later.",
        "In the repair prompt include both the previous raw output and the exact Pydantic error text ({{str(e)}}). The model fixes errors much better when it sees them.",
        "For API retries catch {{openai.RateLimitError}}, {{openai.APITimeoutError}}, {{openai.APIConnectionError}}. Sleep {{2**attempt + random.random()}} seconds."
      ],
      approach: "generate(story, llm) -> Suite. main() parses args, calls generate, prints/saves, sets exit code. Keep the LLM as a parameter.",
      solution: R`~~~python
import argparse, json, random, re, sys, time
from typing import Literal, Callable
import openai
from pydantic import BaseModel, ValidationError
from llm import ask   # ask() has a 30 s timeout set in llm.py

class Case(BaseModel):
    title: str
    priority: Literal["P0", "P1", "P2"]
    steps: list[str]
    expected: str
class Suite(BaseModel):
    cases: list[Case]

SYSTEM = ('You are a senior QA engineer. Return ONLY JSON: '
          '{"cases":[{"title":str,"priority":"P0|P1|P2","steps":[str],"expected":str}]}')

def call_with_retry(llm, *a, tries=3, **kw):
    # Retry only transient API errors, never validation errors.
    for n in range(tries):
        try:
            return llm(*a, **kw)
        except (openai.RateLimitError, openai.APITimeoutError, openai.APIConnectionError, openai.InternalServerError):
            if n == tries - 1: raise
            time.sleep(2 ** n + random.random())

def generate(story: str, llm: Callable = ask, retries: int = 2) -> Suite:
    prompt = "Story: " + story
    for _ in range(retries + 1):
        raw = call_with_retry(llm, prompt, system=SYSTEM, temperature=0)
        try:
            m = re.search(r"\{.*\}", raw, re.S)
            if not m: raise ValueError("no JSON object found in the reply")
            return Suite.model_validate_json(m.group(0))
        except (ValidationError, ValueError) as e:
            prompt = f"Story: {story}\n\nYour previous output:\n{raw}\n\nIt was invalid: {e}\nReturn corrected JSON only."
    open("last_invalid.txt", "w").write(raw)
    raise RuntimeError("invalid output after retries")

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("story"); ap.add_argument("--out")
    a = ap.parse_args()
    try:
        text = generate(a.story).model_dump_json(indent=2)
    except RuntimeError as e:
        print(e, file=sys.stderr); sys.exit(1)
    open(a.out, "w").write(text) if a.out else print(text)
~~~`
    },
    {
      id: "p2e2", title: "Give the model a tool: run_api_check", time: "2.5 h",
      goal: "Implement the tool-calling loop with a real HTTP check tool.",
      task: R`1. Write a Python function {{run_api_check(url, expect_status=200)}} that does a GET (timeout 10 s) and returns status, passed (bool) and elapsed ms.
2. Describe it as a tool (JSON schema). Only allow https URLs from an allow-list (e.g. jsonplaceholder.typicode.com, httpbin.org).
3. Write the loop: send question -> run tool calls -> send results -> repeat. Max 5 steps.
4. Ask: "Is https://jsonplaceholder.typicode.com/posts/1 up, and does /posts/99999 return 404?" and print every tool call made.
5. Try a URL not on the allow-list and make sure your code refuses it and tells the model.`,
      criteria: ["Loop ends with a plain-text answer", "Max-step guard works (prove with a fake model that never stops)", "Arguments validated before running", "Allow-list rejection returns an error message to the model, not a crash"],
      hints: [
        "Pick a model that lists 'tools' in its supported parameters on OpenRouter. Otherwise you will never see {{tool_calls}}.",
        "After the model returns tool_calls you must append the assistant message itself, then one {{role: 'tool'}} message per call with {{tool_call_id}} set. Missing the assistant message gives an API error.",
        "{{json.loads(tc.function.arguments)}} can raise or return wrong types. Wrap it in try/except and return an error dict (key {{error}}) as the tool result so the model can recover."
      ],
      approach: "Keep a dict TOOLS = {name: python_function}. The loop looks up the function by name, validates args, runs, and appends the JSON result.",
      solution: R`~~~python
import json, requests
from urllib.parse import urlparse
from llm import get_client, MODEL

ALLOWED = {"jsonplaceholder.typicode.com", "httpbin.org"}

def run_api_check(url: str, expect_status: int = 200):
    u = urlparse(url)
    if u.scheme != "https" or u.hostname not in ALLOWED:
        return {"error": f"host not allowed: {u.hostname}"}
    # allow_redirects=False: a redirect could otherwise send us to a host outside the allow-list
    r = requests.get(url, timeout=10, allow_redirects=False)
    return {"status": r.status_code, "passed": r.status_code == expect_status,
            "ms": int(r.elapsed.total_seconds() * 1000)}

TOOLS = {"run_api_check": run_api_check}
SPEC = [{"type": "function", "function": {
    "name": "run_api_check",
    "description": "GET an https URL and compare the HTTP status to the expected one.",
    "parameters": {"type": "object",
                   "properties": {"url": {"type": "string"}, "expect_status": {"type": "integer"}},
                   "required": ["url"]}}}]

def default_model_call(msgs):
    return get_client().chat.completions.create(model=MODEL, messages=msgs, tools=SPEC).choices[0].message

def agent(question, max_steps=5, model_call=default_model_call):   # model_call is injectable: tests pass a fake
    msgs = [{"role": "user", "content": question}]
    for _ in range(max_steps):
        m = model_call(msgs)
        if not m.tool_calls:
            return m.content
        msgs.append(m.model_dump(exclude_none=True))
        for tc in m.tool_calls:
            try:
                args = json.loads(tc.function.arguments)
                result = TOOLS[tc.function.name](**args)
            except Exception as e:
                result = {"error": str(e)}
            print("TOOL", tc.function.name, tc.function.arguments, "->", result)
            msgs.append({"role": "tool", "tool_call_id": tc.id, "content": json.dumps(result)})
    raise RuntimeError("max steps reached")

# test: a fake model that never stops asking for the tool must hit the guard
from types import SimpleNamespace as NS
def test_max_steps_guard():
    call = NS(id="1", function=NS(name="run_api_check", arguments='{"url": "https://httpbin.org/status/200"}'))
    endless = lambda msgs: NS(content=None, tool_calls=[call], model_dump=lambda exclude_none=True: {"role": "assistant"})
    import pytest
    with pytest.raises(RuntimeError): agent("loop", max_steps=3, model_call=endless)
~~~`
    },
    {
      id: "p2e3", title: "Fake LLM + pytest suite", time: "2 h",
      goal: "Test your CLI logic with no network, plus one live smoke test.",
      task: R`1. Create a {{FakeLLM}} class: constructed with a list of replies, returns them in order, records the prompts it received.
2. Write pytest tests for generate(): (a) valid reply passes, (b) invalid then valid triggers one repair, (c) always-invalid raises, (d) reply wrapped in prose still parses, (e) the repair prompt contains the validation error.
3. Add one test marked {{live}} that calls the real model and only asserts properties.
4. Configure pytest so live tests are skipped unless {{--live}} is passed.`,
      criteria: ["5+ offline tests pass with network disabled", "Live test skipped by default", "FakeLLM records prompts and a test asserts on them", "Run time of offline tests under 2 seconds"],
      hints: [
        "FakeLLM only needs {{__call__(self, prompt, system=None, temperature=0)}} so it can replace {{ask}}. That is why Phase 2 exercise 1 took the LLM as a parameter.",
        "Register the marker and the option in {{conftest.py}} with {{pytest_addoption}} and {{pytest_collection_modifyitems}}.",
        "Assert on behaviour: {{len(fake.prompts) == 2}} proves exactly one repair happened."
      ],
      approach: "Dependency injection removes the need for mocking libraries. A 10-line fake is enough.",
      solution: R`~~~python
# test_gen.py
import pytest
from story_to_tests import generate

GOOD = '{"cases":[{"title":"t","priority":"P1","steps":["s"],"expected":"e"}]}'

class FakeLLM:
    def __init__(self, replies): self.replies, self.prompts = list(replies), []
    def __call__(self, prompt, system=None, temperature=0):
        self.prompts.append(prompt); return self.replies.pop(0)

def test_valid(): assert len(generate("x", FakeLLM([GOOD])).cases) == 1
def test_prose_wrapped(): assert generate("x", FakeLLM(["Sure! " + GOOD + " Hope it helps"]))
def test_repair():
    f = FakeLLM(["not json", GOOD]); generate("x", f)
    assert len(f.prompts) == 2 and "invalid" in f.prompts[1]
def test_repair_prompt_has_previous_output():
    f = FakeLLM(["not json at all", GOOD]); generate("x", f)
    assert "not json at all" in f.prompts[1]
def test_gives_up():
    with pytest.raises(RuntimeError): generate("x", FakeLLM(["bad"] * 3))

@pytest.mark.live
def test_live():
    s = generate("As a user I can log out")
    assert s.cases and all(c.steps for c in s.cases)

# conftest.py
import pytest
def pytest_addoption(parser): parser.addoption("--live", action="store_true")
def pytest_configure(config): config.addinivalue_line("markers", "live: calls the real LLM")
def pytest_collection_modifyitems(config, items):
    if config.getoption("--live"): return
    skip = pytest.mark.skip(reason="need --live")
    for i in items:
        if "live" in i.keywords: i.add_marker(skip)
~~~`
    },
  ],
  resources: [
    ["OpenAI function calling guide", "https://developers.openai.com/api/docs/guides/function-calling"],
    ["Anthropic tool use overview", "https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview"],
    ["Pydantic docs", "https://pydantic.dev/docs/"],
    ["pytest: custom markers and options", "https://docs.pytest.org/en/stable/example/simple.html"],
  ],
});

window.PHASES.push({
  id: "p3", n: 3, title: "MCP & Playwright Agents", weeks: "Weeks 5-6",
  goal: "Connect AI to tools through MCP, use AI to explore and write Playwright tests, and learn to review what it produces.",
  deliverable: "AI-generated Playwright specs you reviewed and fixed, a defect log of what the AI got wrong, and your own MCP server.",
  setup: R`## Setup for this phase
1. **Node 18+** and a new folder for the Playwright project. In it run {{npm init playwright@latest}} (choose TypeScript) and then {{npx playwright install}} to download browsers.
2. **An MCP host.** These exercises use **Claude Code** (commands shown as {{claude mcp add ...}}). Other hosts (Claude Desktop, VS Code, Cursor) work too; each has its own place to register servers, so follow its docs and use the same server command.
3. **Playwright Agents** (planner, generator, healer): in the Playwright project run the agents init command from playwright.dev/docs/test-agents for your AI tool (it looks like {{npx playwright init-agents --loop=claude}}; flags depend on your Playwright version, so check the docs). It adds agent definition files to your repo.
4. For exercise 2 (your MCP server) use the Python venv from Phase 1 and run {{pip install "mcp<2" requests}}. The code below uses the 1.x import {{from mcp.server.fastmcp import FastMCP}}. In mcp 2.x that class was renamed: use {{from mcp.server.mcpserver import MCPServer}} and {{MCPServer("name")}}; the {{@mcp.tool()}} decorator and {{mcp.run()}} stay the same. (Both were checked: the server below passes a real stdio client test on mcp 1.30, and the 2.x rename registers the same tools.)

If something differs from the docs, trust the docs: these tools change fast.`,
  learn: [
    { t: "What MCP is", md: R`## Model Context Protocol
An open standard for connecting AI apps to tools and data. Think "USB-C for AI tools".

- **Host**: the AI app (Claude Code, Claude Desktop, an IDE).
- **Client**: lives in the host, talks to one server.
- **Server**: a small program that exposes capabilities.

A server can expose:
- **Tools** - actions the model can call (run a check, click a button).
- **Resources** - data the model can read (files, docs).
- **Prompts** - reusable prompt templates.

Transports: **stdio** (host starts your program locally) and **HTTP** (remote server).

Security: a server runs with your permissions. Install only trusted servers and read their tool lists. Tool descriptions are text the model reads, so a malicious server can try prompt injection (Phase 6).` },
    { t: "Playwright MCP", md: R`## Letting an AI drive a browser
Playwright MCP gives the model tools like navigate, click, type, snapshot.

Key idea: it reads the page as an **accessibility snapshot** (a structured text tree of roles and names), not screenshots. It is faster, cheaper and more reliable than pixel guessing, and it pushes you towards accessible locators.

Add it to Claude Code:

~~~bash
claude mcp add playwright npx @playwright/mcp@latest
~~~

Then prompt: "Open https://www.saucedemo.com, explore the login and inventory flows, and write a test plan as markdown."

Check the current README at github.com/microsoft/playwright-mcp for options (headless, browser, storage state).` },
    { t: "Playwright Agents: planner, generator, healer", md: R`## Three cooperating agents
Recent Playwright versions ship an agent workflow:

1. **Planner** - explores the app and writes a markdown test plan.
2. **Generator** - turns the plan into Playwright test files.
3. **Healer** - runs failing tests, inspects the UI, and patches the test.

Setup is a single init command that writes agent definitions into your repo (see docs: playwright.dev/docs/test-agents; the exact flags depend on your version and which AI tool you use).

Workflow that works: plan -> **you read and edit the plan** -> generate -> run -> **you review the code** -> heal -> review again. The human gates are the point.` },
    { t: "Reviewing AI-written tests", md: R`## The reviewer checklist
AI tests often look fine and still prove nothing. Check:

1. **Real assertion?** Tautologies ({{count() >= 0}}), no assertion at all, or asserting on something the test itself set.
2. **Would it fail if the feature broke?** Mutate the app or the assertion and see.
3. **Waits**: no {{waitForTimeout}}. Use web-first assertions ({{await expect(locator).toBeVisible()}}).
4. **Locators**: prefer {{getByRole}}, {{getByLabel}}, {{getByTestId}}. Avoid long CSS/XPath chains and {{nth-child}}.
5. **Test data**: no hard-coded secrets, no dependence on order or on data from another test.
6. **Independence and naming**: one behaviour per test, name says the behaviour.
7. **Healer danger**: a healer can "fix" a failure by weakening the assertion. Always diff what it changed.

Keep a **defect log** of AI mistakes. It becomes your best prompt guardrail list.` },
  ],
  exercises: [
    {
      id: "p3e1", title: "Explore an app with Playwright MCP and write a test plan", time: "2 h",
      goal: "Use the AI as an exploratory tester and get a reviewed plan.",
      task: R`1. Add Playwright MCP to your AI tool (command in the Learn tab).
2. Ask it to explore https://www.saucedemo.com (public demo shop) and produce {{test-plan.md}}: scenarios grouped by feature, each with preconditions, steps, expected results.
3. Read the plan critically. Add at least 3 scenarios the AI missed (think: locked-out user, sorting, cart persistence, negative cases).
4. Mark each scenario P0/P1/P2.`,
      criteria: ["MCP server connected (tool list visible)", "Plan has 12+ scenarios incl. negative cases", "You added 3+ scenarios and noted them as 'human-added'", "Risk priority on every scenario"],
      hints: [
        "If the tools do not appear, restart the AI session after adding the server and run the MCP list command of your tool to see errors. Node 18+ is required.",
        "Give the AI a structure to fill: 'For each scenario output: ID, title, preconditions, steps, expected, priority'. Free-form plans are harder to review.",
        "Ask a second prompt: 'What scenarios and risks did you NOT cover, and why?'. Models are good at listing their own gaps when asked directly."
      ],
      approach: "Two passes: AI explores and drafts, you challenge it. Your added scenarios show the value you bring.",
      solution: R`Example prompt:

~~~text
You are a QA lead. Using the browser tools, explore https://www.saucedemo.com.
Do not guess: only describe what you observed. Cover login, inventory (sort, add/remove),
cart, checkout. Output markdown with, for each scenario:
ID | Title | Preconditions | Steps | Expected | Priority (P0/P1/P2) | Type (happy/negative/edge).
Finish with a section "Not covered and why".
~~~

Typical human additions: locked_out_user message, problem_user broken images, performance_glitch_user slowness, checkout with empty fields, cart badge after logout/login.`
    },
    {
      id: "p3e2", title: "Build your own MCP server", time: "2.5 h",
      goal: "Expose your {{run_api_check}} function as an MCP tool and call it from an AI tool.",
      task: R`1. {{pip install "mcp<2" requests}} (see the Phase 3 setup card for the mcp 2.x rename).
2. Create {{server.py}} using FastMCP exposing the tool {{run_api_check(url, expect_status)}} (reuse the allow-list from Phase 2).
3. Test it with the MCP Inspector.
4. Register it with your AI tool and ask in plain language to check two URLs.
5. Add a second tool of your choice (e.g. {{save_report(name, text)}} that writes inside a {{reports/}} folder only).`,
      criteria: ["Tool visible in Inspector with a good description and typed params", "AI tool successfully calls it", "Path traversal blocked in save_report (try '../x')", "README: how to install and run"],
      hints: [
        "FastMCP builds the JSON schema from your Python type hints and the docstring becomes the tool description. Write a clear docstring.",
        "Run the inspector with: npx @modelcontextprotocol/inspector python server.py. Check the Tools tab, run a call manually first.",
        "Register in Claude Code with: claude mcp add testpilot-lite -- python server.py (use the full path to python in your venv if imports fail)."
      ],
      approach: "The server is just your Phase 2 tool function with a decorator. Security checks (allow-list, path safety) matter more than the protocol code.",
      solution: R`~~~python
# server.py
from pathlib import Path
from urllib.parse import urlparse
import requests
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("testpilot-lite")
ALLOWED = {"jsonplaceholder.typicode.com", "httpbin.org"}
REPORTS = Path("reports").resolve(); REPORTS.mkdir(exist_ok=True)

@mcp.tool()
def run_api_check(url: str, expect_status: int = 200) -> dict:
    """GET an https URL from the allow-list and compare its HTTP status to expect_status."""
    u = urlparse(url)
    if u.scheme != "https" or u.hostname not in ALLOWED:
        return {"error": f"host not allowed: {u.hostname}"}
    r = requests.get(url, timeout=10, allow_redirects=False)   # redirects could leave the allow-list
    return {"status": r.status_code, "passed": r.status_code == expect_status,
            "ms": int(r.elapsed.total_seconds() * 1000)}

@mcp.tool()
def save_report(name: str, text: str) -> str:
    """Save text to reports/<name>. Only plain file names are allowed."""
    target = (REPORTS / name).resolve()
    if target.parent != REPORTS:
        return "error: invalid name"
    target.write_text(text, encoding="utf-8")
    return f"saved {target.name}"

if __name__ == "__main__":
    mcp.run()
~~~`
    },
    {
      id: "p3e3", title: "Review, fix and heal an AI-written spec", time: "2.5 h",
      goal: "Find the weaknesses in an AI-style test and write the defect log.",
      task: R`Here is a typical AI-generated test:

~~~ts
import { test, expect } from '@playwright/test';

test('login works', async ({ page }) => {
  await page.goto('https://www.saucedemo.com');
  await page.waitForTimeout(3000);
  await page.locator('div > div:nth-child(2) > input').fill('standard_user');
  await page.fill('#password', 'secret_sauce');
  await page.click('#login-button');
  expect(await page.locator('.title').count()).toBeGreaterThan(-1);
});
~~~

1. List every problem you can find (aim for 6+).
2. Rewrite the test properly, plus one negative test (locked_out_user).
3. Prove the new test can fail: break a locator or expected text and see it go red.
4. Then generate 3 more specs with the Generator agent (or your AI tool) from your Phase 3 exercise 1 plan and review each with the checklist. Log all defects in {{defect-log.md}}.`,
      criteria: ["6+ defects identified in the sample", "Fixed test uses getByRole/getByPlaceholder and web-first assertions", "Mutation check done and noted", "defect-log.md has at least 5 entries from AI-generated tests, each with a prompt-guardrail idea"],
      hints: [
        "Look at: the sleep, the CSS chain, hard-coded credentials, the assertion, the missing URL check, the vague test name.",
        "The assertion count() > -1 is always true. Replace with {{await expect(page).toHaveURL(/inventory/)}} and {{await expect(page.locator('.title')).toHaveText('Products')}}.",
        "Move credentials into a fixtures file or env vars. Use {{getByPlaceholder('Username')}} and {{getByRole('button', { name: 'Login' })}}."
      ],
      approach: "Sample defects: hard sleep; brittle nth-child selector; mixed selector styles; tautological assertion; no URL/state assertion; hard-coded credentials; unclear name; no negative path.",
      solution: R`~~~ts
import { test, expect } from '@playwright/test';

const USER = process.env.SAUCE_USER ?? 'standard_user';
const PASS = process.env.SAUCE_PASS ?? 'secret_sauce'; // public demo password

test('standard user can log in and sees the product list', async ({ page }) => {
  await page.goto('https://www.saucedemo.com');
  await page.getByPlaceholder('Username').fill(USER);
  await page.getByPlaceholder('Password').fill(PASS);
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page).toHaveURL(/inventory/);
  await expect(page.locator('[data-test="title"]')).toHaveText('Products');
});

test('locked out user sees an error and stays on the login page', async ({ page }) => {
  await page.goto('https://www.saucedemo.com');
  await page.getByPlaceholder('Username').fill('locked_out_user');
  await page.getByPlaceholder('Password').fill(PASS);
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page.locator('[data-test="error"]')).toContainText('locked out');
  await expect(page).not.toHaveURL(/inventory/);
});
~~~

Mutation check: change 'Products' to 'Prodcts' and confirm the first test fails.`
    },
  ],
  resources: [
    ["Model Context Protocol docs", "https://modelcontextprotocol.io"],
    ["Playwright MCP repository", "https://github.com/microsoft/playwright-mcp"],
    ["Playwright test agents", "https://playwright.dev/docs/test-agents"],
    ["MCP Python SDK", "https://github.com/modelcontextprotocol/python-sdk"],
    ["Playwright best practices", "https://playwright.dev/docs/best-practices"],
  ],
});
