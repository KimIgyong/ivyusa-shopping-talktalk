---
doc_id: GTJ-KB-HOTEL-ADMIN-EN
title: Go2Joy Hotel Partner Admin Manual (English)
version: 1.0
status: draft
last_updated: 2026-08-28
source: Translated from reference/go2joy-hotel-admin-kb.md (ko original, v1.0)
audience: Hotel partner operators / CS agents / RAG chatbot
language: en
---

# Go2Joy Hotel Partner Admin Knowledge Base (English)

> **Purpose of this document**
> The hotel-partner admin manual restructured into task-unit KB articles.
> Each article is written to be searched and cited independently, ready for
> RAG embedding and customer-support use.
>
> **Article template**: `Purpose → Path → Steps → Notes → Related`
> **Article ID convention**: `GTJ-{AREA}-{SEQ}` (same IDs as the Korean original)

---

# 1. Dashboard

## GTJ-DSH-01 · View Dashboard

**Purpose**
Monitor the hotel's booking volume, operational performance, and customer reviews on a single screen.

**Path**
`Admin > Dashboard`

**Dashboard sections**

### 1) Booking Overview
Summarizes and drills into daily bookings by two axes:

- **By Booking Type** — Hourly / Overnight / Daily
- **By Booking Status**

### 2) Hotel Performance

| Metric | Definition |
|---|---|
| Visitors | Number of customers who visited (viewed) the hotel during the selected period |
| Views | Number of visits/views of the hotel's page |
| Bookings | Number of successfully completed bookings |
| Check-ins | Number of actual check-ins |
| Net Revenue | Room rate + surcharges − hotel promotions |
| Payments Received | Total amount customers actually paid for completed bookings |

> **Net Revenue formula**
> `Net Revenue = Room Rate + Surcharges − Hotel Promotions`

### 3) Reviews Overview
Shows a summary of the customer reviews registered for the hotel.

**Notes**
- `Visitors` and `Views` are different metrics: Visitors counts **customers**, Views counts **page views**.
- `Net Revenue` and `Payments Received` are calculated on different bases — distinguish them when answering settlement questions.

**Related**
`GTJ-REV-01`

---

# 2. Review Management

## GTJ-REV-01 · Reply to a Review

**Purpose**
Post the hotel's reply to a customer review.

**Path**
`Admin > Review Management`

**Steps**

1. On the review you want to answer, select **[Reply]**
2. Enter the reply text
3. Submit the reply and confirm the system's **success notification**

**Notes**
- ⚠️ **Only one reply is allowed per review (comment).**
- A reply cannot be edited or re-posted after submission, so always check the text before submitting.

**Related**
`GTJ-DSH-01` (Reviews Overview)

---

# 3. Room Type Management

## 3.1 Direct Discount Settings

### GTJ-DIS-01 · Create / Edit a Direct Discount Program

**Purpose**
Create or edit a direct room-discount program that applies during a set period or on specific days.

**Path**
`Admin > Room Type Management > Direct Discount Settings`

**Steps**

**STEP 1. Enter General Information**

- **Program name** — up to **100 characters**
- **Availability period** — choose **one** of the two:
  - Run by period
  - Run on special days
- **Select participating hotels** — pick the target hotels
- Select **[Continue]**

**STEP 2. Set up discounts**

- **Individual room settings** — set the discount per room
- **Bulk settings** — apply the same discount to multiple rooms at once
- **Add participating hotels** — add hotels to the program
- **Edit discounted prices** — discounted prices can still be edited after the program is set up

**Notes**
- The program name cannot exceed 100 characters.
- The availability period is either `by period` or `special days` — the two cannot be combined.
- **Discounted prices remain editable** even after the program setup is complete.

**Related**
`GTJ-DIS-02`, `GTJ-DIS-03`, `GTJ-DIS-04`

---

### GTJ-DIS-02 · Search Direct Discount Programs

**Purpose**
Search registered direct discount programs by name or status.

**Path**
`Admin > Room Type Management > Direct Discount Settings > List`

**Steps**

**A. Search by name**
1. Enter the program name
2. Click **[Search]**

**B. Search by Status**
1. Select a status
2. Click **[Search]**

**Related**
`GTJ-DIS-03`

---

### GTJ-DIS-03 · View Discount Program List

**Purpose**
Review the list of registered direct discount programs and the details of each entry.

**List columns**

| Column | Description |
|---|---|
| Program name | Name of the registered program |
| Status | One of three: **Running / Stopped / Expired** |
| Number of participating hotels | How many hotels the program includes |
| Applicable bookings | Applies to bookings with a specific stay date |
| Creator | The user who created the program |

**Notes**
- Discounts apply based on the **stay date**, not the booking date.

**Related**
`GTJ-DIS-02`, `GTJ-DIS-04`

---

### GTJ-DIS-04 · Stop a Direct Discount Program

**Purpose**
Stop a direct discount program that is currently running.

**Steps**

1. In the list, select **[Stop Program]** on the target program
2. In the confirmation popup, click **[Stop Program]** again to confirm

**Notes**
- ⚠️ The **[Stop Program]** button appears only on programs whose status is **Running**.
- The stop takes effect only after the second click in the confirmation popup (two-step confirmation).

**Related**
`GTJ-DIS-03`

---

## 3.2 Flash Sale Settings

### GTJ-FLS-01 · Set Up Hourly Flash Sale

**Purpose**
Create a flash sale program for Hourly rooms.

**Path**
`Admin > Room Type Management > Hourly room type list`

**Steps**

1. Go to the Hourly room type list
2. Select **[Set up Flash Sale]**
3. Review the flash sale setup popup
4. Select **[Create Program]**
5. Confirm the system's **success notification**

**Notes**
- For hourly flash sales, **price setup is optional**.
  *(Further conditions are not covered in the source manual — pending update.)*

**Related**
`GTJ-FLS-02`, `GTJ-FLS-03`

---

### GTJ-FLS-02 · Set Up Overnight Flash Sale

**Purpose**
Create a flash sale program for Overnight rooms.

**Path**
`Admin > Room Type Management > [Overnight] tab`

**Steps**

1. Select the **[Overnight]** tab
2. Select **[Flash Sale Setup]**
3. Review the flash sale setup popup
4. Select **[Create Program]**
5. Confirm the system's **success notification**

**Related**
`GTJ-FLS-01`, `GTJ-FLS-03`

---

### GTJ-FLS-03 · Stop Flash Sale

**Purpose**
Stop a flash sale program that is in progress.

**Steps**

1. On the **Timeline**, select the **Room Type** and **Booking Type** to stop
2. Review the flash sale program details
3. Select **[Stop Program]**
4. Confirm the system's **success notification**

**Notes**
- Stopping is done on the **Timeline screen**. The program details open only after both the room type and the booking type are selected.

**Related**
`GTJ-FLS-01`, `GTJ-FLS-02`

---

## 3.3 Surcharge Settings — *Pending update (Updating)*

### GTJ-SUR-01 · Set Up Surcharges

**Purpose**
Set surcharges for a specific room based on period and day-of-week conditions.

**Path**
`Room Settings > the room > Surcharges`

**Steps**

1. Go to `Room Settings > the room > Surcharges`
2. Select the **surcharge period** — start/end dates and applicable days of the week
3. Enter the **surcharge amount** — as a **percentage (%)** or a **fixed amount**
4. Select **[Create Schedule]**
5. Select **[Save]**

**Notes**
- ⚠️ **Recommendation**: do not combine multiple conditions into one surcharge — **create one surcharge per condition**. It makes later deletion and editing much easier.
- The amount is entered in one of two ways: percentage (%) or fixed amount.
- 🔧 This item is marked **Updating** in the source manual — re-verify before treating it as final.

**Related**
`GTJ-SUR-02`, `GTJ-DSH-01` (Surcharges are part of the Net Revenue formula)

---

### GTJ-SUR-02 · Delete Surcharges

**Purpose**
Delete a registered surcharge setting.

**Path**
`Room Settings > the room > Surcharges`

**Steps**

1. Go to `Room Settings > the room > Surcharges`
2. Select **[Delete]**
3. Confirm the system's **success notification**

**Notes**
- 🔧 This item is marked **Updating** in the source manual — re-verify before treating it as final.

**Related**
`GTJ-SUR-01`

---

## 3.4 Quick Room Lock

### GTJ-QLK-01 · Set Up Quick Room Lock

**Purpose**
Immediately block a room from being sold, effective from the current moment (e.g. the room suddenly becomes unusable).

**Steps**

1. Select **[Quick Room Lock]**
2. Select the **Booking Type** to lock
3. Select the **period** to lock — the system defaults to the **current time / today**
4. Review the lock details
5. Select **[Add Lock Schedule]**

**Notes**
- Because the default is the **current time / today**, always adjust the period when locking a future schedule.
- For planned, longer-term locks, use `GTJ-LCK-01~03` (Room Lock Settings) instead.

**Related**
`GTJ-QLK-02`, `GTJ-LCK-01`

---

### GTJ-QLK-02 · Delete Quick Room Lock

**Purpose**
Delete a quick room lock that has been set.

**Steps**

1. Select **[Room Lock Settings]**
2. Find the quick-lock entry in the **Room Lock History** list
3. Select the 🗑️ **delete icon**
4. Select **[Confirm]**

**Notes**
- A quick lock is **removed from the [Room Lock Settings] screen** — the setup screen and the removal screen are different.

**Related**
`GTJ-QLK-01`, `GTJ-LCK-04`

---

## 3.5 Room Lock Settings

> Common: the options differ by booking type (Hourly / By Day / Overnight).

### GTJ-LCK-01 · Room Lock – Hourly

**Steps**

1. Select the **hotel**
2. Select the **Room Type**
3. Under booking type, select **[Hourly]**
4. Select the **date range + time slots**
5. Select **[Add Lock Schedule]**
6. Confirm the system's **success notification**

**Notes**
- Hourly locks require **both a date range and time slots** — this is what sets them apart from the other booking types.

---

### GTJ-LCK-02 · Room Lock – By Day

**Steps**

1. Select the **hotel**
2. Select the **Room Type**
3. Under booking type, select **[By Day]**
4. Select the **date(s)**
5. Select **[Add Room Block]**
6. Confirm the system's **success notification**

---

### GTJ-LCK-03 · Room Lock – Overnight

**Steps**

1. Select the **hotel**
2. Select the **Room Type**
3. Under booking type, select **[Overnight]**
4. Select the **date(s)**
5. Select **[Add Room Block]**
6. Confirm the system's **success notification**

---

### GTJ-LCK-04 · Delete Room Lock Settings

**Steps**

1. Select **[Room Lock Settings]**
2. Select the **[Delete] icon** on the lock entry to remove
3. Confirm the system's **success notification**

**Related**
`GTJ-LCK-01`, `GTJ-LCK-02`, `GTJ-LCK-03`, `GTJ-QLK-02`

---

# 4. Reports

## GTJ-RPT-01 · Download "Shock-Discount Room" Report — *Pending update (Updating)*

**Purpose**
Download the report on shock-discount rooms.

**Status**
🔧 The source manual marks this item only as **Updating**; the detailed procedure is not documented.

**To Be Confirmed**
- Entry path
- Query conditions (period, hotel, room type, etc.)
- Download file format and column definitions
- Permission requirements

---

# 5. Glossary

| Term | Definition |
|---|---|
| Hourly | Booking type used by the hour |
| Overnight | Booking type for overnight stays |
| Daily / By Day | Booking type by the day |
| Net Revenue | Room rate + surcharges − hotel promotions |
| Payments Received | Total amount customers actually paid for completed bookings |
| Direct Discount | Room discount program the hotel sets up itself, based on a period or specific days |
| Flash Sale | Short-term intensive discount program (set up separately for Hourly / Overnight) |
| Surcharge | Extra room charge applied by period and day-of-week conditions (percentage or fixed amount) |
| Quick Room Lock | Blocks the room from sale immediately, from the current moment |
| Room Lock / Room Block | Blocks the room from sale for a designated period |
| Timeline | Screen for viewing and operating program status by room and booking type |
| Shock-Discount Room | Room covered by a shock-discount promotion |

---

# 6. Status Values

## Direct Discount Program Status

| Status | Meaning | Stop button shown |
|---|---|---|
| Running | Program currently in effect | ✅ shown |
| Stopped | Program stopped manually by an operator | ❌ not shown |
| Expired | Program whose availability period has ended | ❌ not shown |
