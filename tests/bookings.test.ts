// Unit tests for bookings: checking, availability, deposits and stages. Run: npm run test:unit
import assert from "node:assert/strict";
import { bookableServices, bookingProgress, checkBooking, dateProblem, depositFor, unavailableDates, bookingDetailsBlock } from "../src/lib/bookings";

// Bookable services and limits.
const services: any[] = [
  { id: "a", name: "Day", rate: 1000, unit: "Day", businessId: "b" },
  { id: "b", name: "Camera", rate: 90, unit: "Camera", businessId: "b", minQuantity: 2 },
  { id: "c", name: "Hidden", rate: 1, unit: "x", businessId: "b", showOnRateCard: false },
  { id: "d", name: "Off", rate: 1, unit: "x", businessId: "b" }
];
const biz: any = { id: "b", booking: { services: { d: { bookable: false }, a: { maxQuantity: 3, deposit: { type: "percent", value: 50 } } }, deposit: { type: "fixed", value: 100 } } };
const bs = bookableServices(services, biz);
assert.deepEqual(bs.map(s => s.id), ["a", "b"]);
assert.equal(bs[0].maxQuantity, 3); assert.equal(bs[1].minQuantity, 2);
const c = checkBooking(bs, [], { items: [{ serviceId: "a", quantity: 2 }, { serviceId: "a", quantity: 5 }, { serviceId: "b", quantity: 1 }] });
assert.deepEqual(c.items.map(i => [i.serviceId, i.quantity]), [["a", 3], ["b", 2]], "merged, capped at max, raised to min");
assert.equal(c.estimate, 3 * 1000 + 2 * 90);

// Deposits: service rule (50% of its line) plus the business rule (fixed 100 once) for the rest.
assert.equal(depositFor(biz.booking, [{ itemId: "a", total: 2000, quantity: 2 }, { itemId: "b", total: 180, quantity: 2 }]), 1100);
assert.equal(depositFor({}, [{ itemId: "a", total: 2000, quantity: 2 }]), null, "no rule, no deposit");
assert.equal(depositFor({ deposit: { type: "percent", value: 30 } }, [{ total: 1000, quantity: 1 }, { total: 50, quantity: 1, kind: "reimbursement" }]), 300, "reimbursements excluded");
assert.equal(depositFor({ deposit: { type: "fixed", value: 5000 } }, [{ total: 1000, quantity: 1 }]), 1000, "never more than the quote");

// Availability: Mon–Fri, 2 days ahead, one blocked date, one booking a day.
const settings: any = { availability: { enabled: true, workingDays: [1, 2, 3, 4, 5], leadDays: 2, blockedDates: ["2027-06-02"], maxPerDay: 1 } };
const today = "2027-05-31"; // a Monday
const counts = new Map([["2027-06-03", 1]]);
assert.match(dateProblem(settings, counts, today, "2027-06-01")!, /at least 2 days/);
assert.match(dateProblem(settings, counts, today, "2027-06-02")!, /isn't available/);
assert.match(dateProblem(settings, counts, today, "2027-06-03")!, /fully booked/);
assert.equal(dateProblem(settings, counts, today, "2027-06-04"), null);
assert.match(dateProblem(settings, counts, today, "2027-06-05")!, /day of the week/);
assert.equal(dateProblem({}, counts, today, "2027-06-05"), null, "off: any date");
const u: any = unavailableDates(settings, counts, today);
assert.equal(u.earliestDate, "2027-06-02");
assert.ok(u.unavailableDates.includes("2027-06-05") && u.unavailableDates.includes("2027-06-03") && !u.unavailableDates.includes("2027-06-04"));
assert.deepEqual(u.fullDates, ["2027-06-03"]); assert.deepEqual(u.blockedDates, ["2027-06-02"]);

// Stages, including a deposit paid before the rest is invoiced.
const q = { id: "q", type: "quote", status: "accepted" } as any;
const dep = { id: "d1", type: "invoice", sourceQuoteId: "q", isDeposit: true } as any;
const fin = { id: "f1", type: "invoice", sourceQuoteId: "q" } as any;
const stage = (docs: any[]) => bookingProgress({ status: "quoted", documentId: "q" }, docs).stage;
assert.equal(stage([q, { ...dep, status: "sent" }]), "invoiced");
assert.equal(stage([q, { ...dep, status: "paid" }]), "part_paid", "deposit paid, rest not invoiced");
assert.equal(stage([q, { ...dep, status: "paid" }, { ...fin, status: "sent" }]), "part_paid");
assert.equal(stage([q, { ...dep, status: "paid" }, { ...fin, status: "paid" }]), "paid");
assert.equal(stage([q, { ...fin, status: "cancelled" }]), "quote_accepted", "cancelled invoices don't count");

// The quote's Booking details block.
assert.equal(bookingDetailsBlock({ eventDate: "2027-03-28", location: "Suva", details: [{ label: "Audience", value: "300" }] }),
  "Booking details\n- Date: 2027-03-28\n- Location: Suva\n- Audience: 300");
console.log("booking checks passed");
