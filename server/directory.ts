import express, { type NextFunction, type Response } from "express";
import crypto from "crypto";
import { getAdminDb, requireUser, rateLimit, isEmail, type AuthedRequest } from "./security";
import { notifyConsultant, notifyEmail, later } from "./notify";

// Shared marketplace data. Both collections are server-only (Firestore rules deny browser access);
// every read and write goes through these routes so users only change their own listing and bookings.
const LISTINGS = "directory_listings";
const BOOKINGS = "directory_bookings";

const BOOKING_STATUSES = ["pending", "accepted", "declined", "completed", "cancelled"] as const;
const MEETING_TYPES = ["in_person", "zoom_video", "phone_call"];
const PAYMENT_METHODS = ["mpaisa", "mycash", "bank_transfer"];

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? Math.round(n * 100) / 100 : null;
}

function asyncRouter() {
  const router = express.Router();
  for (const method of ["get", "post", "put", "patch", "delete"] as const) {
    const original = router[method].bind(router) as any;
    (router as any)[method] = (path: string, ...handlers: any[]) =>
      original(path, ...handlers.map(h => (req: any, res: any, next: any) => Promise.resolve(h(req, res, next)).catch(next)));
  }
  return router;
}

/** Builds a listing from the fields a consultant chose to publish. Nothing else is stored. */
function listingFromBody(uid: string, body: any) {
  const specialties = Array.isArray(body?.directorySpecialties)
    ? body.directorySpecialties.map((s: unknown) => str(s, 60)).filter(Boolean).slice(0, 12)
    : [];
  const logoUrl = str(body?.logoUrl, 2000);
  return {
    uid,
    businessId: str(body?.businessId, 100),
    name: str(body?.name, 120),
    brandSlogan: str(body?.brandSlogan, 160),
    category: str(body?.category, 80),
    city: str(body?.city, 80),
    directoryBio: str(body?.directoryBio, 1500),
    directorySpecialties: specialties,
    startingRate: num(body?.startingRate),
    rateUnit: str(body?.rateUnit, 30),
    currency: str(body?.currency, 6) || "FJD",
    email: isEmail(body?.email) ? body.email.trim() : "",
    phone: str(body?.phone, 40),
    colorTheme: /^#[0-9a-fA-F]{3,8}$/.test(body?.colorTheme || "") ? body.colorTheme : "#0284c7",
    logoType: ["text", "symbol", "image"].includes(body?.logoType) ? body.logoType : "symbol",
    logoSymbol: str(body?.logoSymbol, 40),
    logoText: str(body?.logoText, 12),
    // Only https images; data URLs are too large for the listing and can't be safely shown to others.
    logoUrl: /^https:\/\//.test(logoUrl) ? logoUrl : "",
    listed: true,
    updatedAt: new Date().toISOString()
  };
}

export function createDirectoryRouter() {
  const router = asyncRouter();
  router.use(requireUser);

  // All published listings (newest first).
  router.get("/", rateLimit({ name: "dir-read", max: 120, windowMs: 60_000 }), async (_req: AuthedRequest, res) => {
    const snap = await getAdminDb().collection(LISTINGS).where("listed", "==", true).limit(500).get();
    const listings = snap.docs.map(d => d.data())
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    res.json({ listings });
  });

  // Publish or update the caller's own listing.
  router.put("/listing", rateLimit({ name: "dir-write", max: 30, windowMs: 60_000 }), async (req: AuthedRequest, res) => {
    const listing = listingFromBody(req.user!.uid, req.body);
    if (!listing.name || !listing.businessId) return res.status(400).json({ error: "Your business needs a name before it can be listed." });
    await getAdminDb().collection(LISTINGS).doc(req.user!.uid).set(listing);
    res.json({ listing });
  });

  // Remove the caller's listing.
  router.delete("/listing", async (req: AuthedRequest, res) => {
    await getAdminDb().collection(LISTINGS).doc(req.user!.uid).delete();
    res.json({ ok: true });
  });

  // Bookings the caller sent and received.
  router.get("/bookings", rateLimit({ name: "dir-read", max: 120, windowMs: 60_000 }), async (req: AuthedRequest, res) => {
    const db = getAdminDb();
    const uid = req.user!.uid;
    const [sent, received] = await Promise.all([
      db.collection(BOOKINGS).where("requesterUid", "==", uid).limit(300).get(),
      db.collection(BOOKINGS).where("providerUid", "==", uid).limit(300).get()
    ]);
    const byNewest = (a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt));
    res.json({
      sent: sent.docs.map(d => d.data()).sort(byNewest),
      received: received.docs.map(d => d.data()).sort(byNewest)
    });
  });

  // Request a booking with a listed business.
  router.post("/bookings", rateLimit({ name: "dir-book", max: 10, windowMs: 60 * 60_000 }), async (req: AuthedRequest, res) => {
    const db = getAdminDb();
    const uid = req.user!.uid;
    const providerUid = str(req.body?.providerUid, 128);
    if (!providerUid) return res.status(400).json({ error: "Choose a business to book." });
    if (providerUid === uid) return res.status(400).json({ error: "You can't book your own business." });

    const listingSnap = await db.collection(LISTINGS).doc(providerUid).get();
    const listing = listingSnap.data();
    if (!listing?.listed) return res.status(404).json({ error: "This business is no longer listed." });

    const clientName = str(req.body?.clientName, 120);
    const clientEmail = isEmail(req.body?.clientEmail) ? req.body.clientEmail.trim() : (req.user!.email || "");
    const bookingDate = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.bookingDate || "") ? req.body.bookingDate : "";
    if (!clientName || !bookingDate) return res.status(400).json({ error: "Please add your name and a preferred date." });

    const ref = db.collection(BOOKINGS).doc();
    const booking = {
      id: ref.id,
      bookingRef: `BK-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
      providerUid,
      requesterUid: uid,
      requesterAccountEmail: req.user!.email || "",
      businessId: listing.businessId,
      businessName: listing.name,
      businessEmail: listing.email || "",
      businessPhone: listing.phone || "",
      serviceName: str(req.body?.serviceName, 120) || "General enquiry",
      clientName,
      clientEmail,
      clientPhone: str(req.body?.clientPhone, 40),
      bookingDate,
      preferredTime: str(req.body?.preferredTime, 20),
      projectScope: str(req.body?.projectScope, 3000),
      budgetEstimate: num(req.body?.budgetEstimate),
      meetingType: MEETING_TYPES.includes(req.body?.meetingType) ? req.body.meetingType : "zoom_video",
      paymentMethod: PAYMENT_METHODS.includes(req.body?.paymentMethod) ? req.body.paymentMethod : "bank_transfer",
      location: str(req.body?.location, 120),
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await ref.set(booking);
    later(notifyConsultant(providerUid, {
      subject: `New booking request ${booking.bookingRef} from ${clientName}`,
      heading: "You have a new booking request",
      lines: [
        `${clientName} would like to book "${booking.serviceName}" on ${bookingDate}${booking.preferredTime ? ` at ${booking.preferredTime}` : ""}.`,
        booking.projectScope ? `Details: ${booking.projectScope.slice(0, 500)}` : "",
        `Reply to ${clientEmail} or accept it in Frilensa.`
      ].filter(Boolean),
      actionLabel: "View booking",
      actionPath: "/?tab=directory"
    }));
    res.json({ booking });
  });

  // Providers accept/decline/complete; requesters can cancel a booking that hasn't completed.
  router.patch("/bookings/:id", rateLimit({ name: "dir-write", max: 60, windowMs: 60_000 }), async (req: AuthedRequest, res) => {
    const status = req.body?.status;
    if (!BOOKING_STATUSES.includes(status)) return res.status(400).json({ error: "Invalid status." });
    const ref = getAdminDb().collection(BOOKINGS).doc(req.params.id);
    const snap = await ref.get();
    const booking = snap.data();
    const uid = req.user!.uid;
    if (!booking || (booking.providerUid !== uid && booking.requesterUid !== uid)) {
      return res.status(404).json({ error: "Booking not found." });
    }
    const isProvider = booking.providerUid === uid;
    const allowed = isProvider ? ["accepted", "declined", "completed"] : ["cancelled"];
    if (!allowed.includes(status)) return res.status(403).json({ error: "You can't make that change to this booking." });
    if (["completed", "cancelled", "declined"].includes(booking.status)) {
      return res.status(409).json({ error: `This booking is already ${booking.status}.` });
    }
    await ref.update({ status, updatedAt: new Date().toISOString() });
    if (isProvider) {
      const verb = status === "accepted" ? "accepted" : status === "declined" ? "declined" : "marked as completed";
      later(notifyEmail(booking.clientEmail || booking.requesterAccountEmail, {
        subject: `${booking.businessName} ${verb} your booking ${booking.bookingRef}`,
        heading: `Your booking was ${verb}`,
        lines: [`${booking.businessName} ${verb} your request for "${booking.serviceName}" on ${booking.bookingDate}.`,
          booking.businessEmail ? `Contact them at ${booking.businessEmail}${booking.businessPhone ? ` or ${booking.businessPhone}` : ""}.` : ""].filter(Boolean),
        actionLabel: "Open Frilensa",
        actionPath: "/?tab=directory"
      }));
    } else {
      later(notifyConsultant(booking.providerUid, {
        subject: `Booking ${booking.bookingRef} cancelled by ${booking.clientName}`,
        heading: "A booking was cancelled",
        lines: [`${booking.clientName} cancelled their request for "${booking.serviceName}" on ${booking.bookingDate}.`],
        actionLabel: "Open Frilensa",
        actionPath: "/?tab=directory"
      }));
    }
    res.json({ ok: true });
  });

  router.use((err: any, _req: any, res: Response, _next: NextFunction) => {
    console.error("[directory] Request failed:", err?.message || err);
    res.status(500).json({ error: "The directory is temporarily unavailable. Please try again shortly." });
  });

  return router;
}
