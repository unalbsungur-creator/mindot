import assert from "node:assert/strict";
import { before, beforeEach, describe, it, mock } from "node:test";
import type { ComponentProps, ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PublicMessageDetail } from "@/features/board/types";
import type { MemoryProject, PhysicalOrder } from "@/features/memories/types";
import type { User } from "@/features/users/types";
import { defaultLocale } from "@/i18n/config";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { getDictionary } from "@/i18n/translations";

// The admin order detail page against mocked dependencies only — no
// database, no Next.js request. The session (auth), every repository the
// page reads and the status Server Action are stubbed; the real
// requireAdmin runs on top of the stubbed auth(). Run with module mocks (the
// `*` matters: node --test reads "[orderNumber]" as a glob class and finds nothing):
//   npx tsx --experimental-test-module-mocks --test "src/app/admin/orders/*/page.test.tsx"

type ContentProps = ComponentProps<typeof import("./_components/OrderDetailContent").OrderDetailContent>;

const dictionary = getDictionary(defaultLocale);
const ORDER_NUMBER = "MND-2026-TESTABCD";

const order: PhysicalOrder = {
  id: "order-1",
  memoryProjectId: "project-1",
  orderNumber: ORDER_NUMBER,
  status: "pending",
  createdBy: "buyer-1",
  createdAt: "2026-10-13T10:00:00.000Z",
  updatedAt: "2026-10-13T10:00:00.000Z",
};

const project: MemoryProject = {
  id: "project-1",
  messageId: "message-1",
  createdBy: "buyer-1",
  captureMode: "note_only",
  outputType: "physical_gift",
  frameTemplateId: null,
  status: "draft",
  createdAt: "2026-10-13T09:00:00.000Z",
  updatedAt: "2026-10-13T09:00:00.000Z",
} as MemoryProject;

const message = { id: "message-1", content: "a public thought" } as PublicMessageDetail;

// A full user row: everything except name/email must stay on the server.
const customer = {
  id: "google-sub-should-not-leak",
  email: "customer@example.test",
  name: "Test Customer",
  image: "https://example.test/avatar-should-not-leak.png",
  publicId: "pubid-should-not-leak",
  role: "user",
  passwordHash: "hash-should-not-leak",
  username: "username-should-not-leak",
} as unknown as User;
const CUSTOMER_ONLY_VALUES = ["google-sub-should-not-leak", "avatar-should-not-leak", "pubid-should-not-leak", "hash-should-not-leak", "username-should-not-leak"];

let session: { user: { id: string; role: "admin" | "user" } } | null;
let orderResult: PhysicalOrder | null;
let projectResult: MemoryProject | null;
let messageResult: PublicMessageDetail | null;
let customerResult: User | null;
const calls = { order: [] as string[], project: [] as string[], message: [] as string[], customer: [] as string[], statusAction: 0 };

function StubContent(props: ContentProps) {
  void props;
  return null;
}

let RealContent: typeof import("./_components/OrderDetailContent").OrderDetailContent;
let Page: typeof import("./page").default;

before(async () => {
  mock.module("@/features/auth/auth", { namedExports: { auth: async () => session } });
  mock.module("@/features/memories/repository", {
    namedExports: {
      physicalOrderRepository: {
        getByOrderNumber: async (orderNumber: string) => (calls.order.push(orderNumber), orderResult),
      },
      memoryRepository: { getById: async (id: string) => (calls.project.push(id), projectResult) },
    },
  });
  mock.module("@/features/board/repository", {
    namedExports: { getPublicMessageById: async (id: string) => (calls.message.push(id), messageResult) },
  });
  mock.module("@/features/users/repository", {
    namedExports: { userRepository: { getById: async (id: string) => (calls.customer.push(id), customerResult) } },
  });
  mock.module("@/features/memories/actions", {
    namedExports: { updatePhysicalOrderStatus: async () => (calls.statusAction++, { ok: false, error: "unauthorized" }) },
  });
  // The real component, for rendering its branches — imported before the
  // page sees the stub below, so the page's element can be inspected as data.
  ({ OrderDetailContent: RealContent } = await import("./_components/OrderDetailContent"));
  mock.module("./_components/OrderDetailContent", { namedExports: { OrderDetailContent: StubContent } });
  ({ default: Page } = await import("./page"));
});

beforeEach(() => {
  session = null;
  orderResult = order;
  projectResult = project;
  messageResult = message;
  customerResult = customer;
  calls.order = [];
  calls.project = [];
  calls.message = [];
  calls.customer = [];
  calls.statusAction = 0;
});

async function renderPage(orderNumber = ORDER_NUMBER): Promise<ContentProps> {
  const element = (await Page({ params: Promise.resolve({ orderNumber }) } as unknown as Parameters<typeof Page>[0])) as ReactElement<ContentProps>;
  assert.equal(element.type, StubContent, "the page renders OrderDetailContent");
  return element.props;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

function markup(props: ContentProps): string {
  return renderToStaticMarkup(
    <LocaleProvider>
      <RealContent {...props} />
    </LocaleProvider>
  );
}

function assertNoProtectedReads() {
  assert.deepEqual(calls.order, [], "no order lookup");
  assert.deepEqual(calls.project, [], "no project lookup");
  assert.deepEqual(calls.message, [], "no message lookup");
  assert.deepEqual(calls.customer, [], "no customer lookup");
}

function assertAdminsOnly(props: ContentProps) {
  assert.deepEqual(props, { authorized: false, order: null, project: null, message: null, customer: null });
  const html = markup(props);
  assert.ok(html.includes(escapeHtml(dictionary.moderation.unauthorizedTitle)), "admins-only title rendered");
  assert.ok(!html.includes(escapeHtml(dictionary.states.notFoundTitle)), "not the not-found panel");
  assert.ok(!html.includes(ORDER_NUMBER), "no order number in the output");
}

function assertNotFoundPanel(props: ContentProps) {
  const html = markup(props);
  assert.ok(html.includes(escapeHtml(dictionary.states.notFoundTitle)), "not-found title rendered");
  assert.ok(html.includes('href="/admin/orders"'), "links back to the order list");
  assert.ok(!html.includes(escapeHtml(dictionary.moderation.unauthorizedTitle)), "not the admins-only notice");
  assert.ok(!html.includes(customer.email), "no customer email");
}

describe("admin order detail page", () => {
  it("shows the admins-only notice to a signed-out visitor without reading anything", async () => {
    session = null;
    assertAdminsOnly(await renderPage());
    assertNoProtectedReads();
  });

  it("shows the same notice to a signed-in non-admin without reading anything", async () => {
    session = { user: { id: "user-1", role: "user" } };
    assertAdminsOnly(await renderPage());
    assertNoProtectedReads();
  });

  it("shows the not-found panel to an admin for an unknown order number", async () => {
    session = { user: { id: "admin-1", role: "admin" } };
    orderResult = null;
    const props = await renderPage("MND-2026-UNKNOWN0");

    assert.deepEqual(props, { authorized: true, order: null, project: null, message: null, customer: null });
    assert.deepEqual(calls.order, ["MND-2026-UNKNOWN0"]);
    assert.deepEqual([calls.project, calls.message, calls.customer], [[], [], []], "nothing else looked up");
    assertNotFoundPanel(props);
  });

  it("gives an admin the order, its project and message, and only the customer's name and email", async () => {
    session = { user: { id: "admin-1", role: "admin" } };
    const props = await renderPage();

    assert.equal(props.authorized, true);
    assert.equal(props.order, order);
    assert.equal(props.project, project);
    assert.equal(props.message, message);
    assert.deepEqual(props.customer, { name: customer.name, email: customer.email });
    assert.deepEqual(Object.keys(props.customer ?? {}).sort(), ["email", "name"], "no other customer field is passed through");
    assert.deepEqual(calls.order, [ORDER_NUMBER]);
    assert.deepEqual(calls.project, [order.memoryProjectId]);
    assert.deepEqual(calls.message, [project.messageId]);
    assert.deepEqual(calls.customer, [order.createdBy]);

    // Rendered (message left out so the note preview isn't drawn): the order
    // and the customer's name/email appear, no other customer field does.
    const html = markup({ ...props, message: null });
    assert.ok(html.includes(ORDER_NUMBER), "order number rendered");
    assert.ok(html.includes(escapeHtml(customer.name ?? "")), "customer name rendered");
    assert.ok(html.includes(customer.email), "customer email rendered");
    for (const value of CUSTOMER_ONLY_VALUES) assert.ok(!html.includes(value), "no other customer field rendered");
    assert.ok(!html.includes(escapeHtml(dictionary.moderation.unauthorizedTitle)), "not the admins-only notice");
    assert.equal(calls.statusAction, 0, "rendering never calls the status action");
  });

  it("shows the not-found panel to an admin when the order's project is missing", async () => {
    session = { user: { id: "admin-1", role: "admin" } };
    projectResult = null;
    const props = await renderPage();

    assert.equal(props.authorized, true);
    assert.equal(props.order, order);
    assert.equal(props.project, null);
    assert.equal(props.message, null);
    assert.deepEqual(calls.message, [], "no message lookup without a project");
    assertNotFoundPanel(props);
  });
});
