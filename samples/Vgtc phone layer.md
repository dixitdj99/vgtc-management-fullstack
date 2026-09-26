# **VGTC OS — Custom Android-Based Driver & Staff Attendance Terminal**

## **Project**

Build a completely VGTC-branded dedicated attendance terminal operating system for the VGTC Transport Management System.

The goal is to turn an Android phone/tablet into a dedicated **VGTC Attendance & Driver Management Terminal**.

This must NOT feel like a generic Android attendance application.

The final device should boot directly into VGTC, show a custom VGTC boot experience, automatically launch the VGTC interface, operate in kiosk mode, perform face recognition, optionally support fingerprint hardware, work offline, synchronize with the VGTC Firebase backend, and provide transport-specific driver workflows.

---

# **1\. Core Concept**

The device will be installed at a VGTC office entrance.

A driver or staff member approaches the terminal.

The terminal:

1. Detects the person.  
2. Performs local face recognition.  
3. Identifies the employee.  
4. Retrieves the person's current VGTC status.  
5. Determines whether the person is:  
   * Office staff  
   * Driver  
   * Currently on a trip  
   * Returning from a trip  
   * Available  
   * On leave  
   * Already checked in  
6. Records the appropriate attendance/movement event.  
7. Synchronizes the event with the VGTC backend.  
8. Displays a clear confirmation.

The system must understand that drivers may be away for 1–3 days and must NOT mark a driver absent simply because they are away on an active trip.

---

# **2\. Target Platform**

Phase 1:

* Android phone/tablet  
* Native Android application  
* Kotlin  
* Android Camera APIs  
* On-device face recognition  
* Local offline database  
* Firebase backend  
* Firebase App Hosting  
* VGTC domain:  
  `vgtc.site`  
* Attendance domain:  
  `attendance.vgtc.site`

Phase 2:

* Android kiosk / dedicated device configuration  
* Custom launcher  
* Boot customization  
* Device-owner / managed-device configuration  
* Remote device management

Phase 3:

* AOSP-based VGTC OS  
* Custom boot animation  
* VGTC system launcher  
* VGTC system services  
* Dedicated VGTC system image for supported hardware  
* OTA/update architecture

Do NOT attempt Phase 3 before Phase 1 and Phase 2 are stable.

---

# **3\. VGTC OS Identity**

The device must be branded entirely as VGTC.

Brand name:

VGTC OS

Subtitle:

VGTC Transport Management System

The normal Android user experience should eventually be hidden.

The user should not see:

* Standard Android launcher  
* Random Android branding  
* Unnecessary apps  
* Notification clutter  
* Browser  
* Play Store  
* Settings  
* Status bar controls  
* Unwanted system UI

The terminal should feel like a purpose-built VGTC device.

---

# **4\. Custom Boot Experience**

Create a custom VGTC boot sequence.

Example:

VGTC logo

V

VGTC

Transport Management System

Starting VGTC Terminal...

Then load the attendance interface.

Create:

* VGTC boot logo  
* VGTC boot animation  
* VGTC loading screen  
* VGTC startup sound, optional  
* Device initialization screen

The boot experience must be lightweight and fast.

For Phase 1, implement this as the application startup experience.

For Phase 3, implement it at the AOSP/boot-animation level.

---

# **5\. Main Terminal Screen**

Create a clean, professional industrial UI.

The default screen should show:

VGTC

ATTENDANCE TERMINAL

\[ Live camera preview \]

"Please look at the camera"

Below:

Fingerprint  
or  
Employee ID

The UI must be optimized for:

* Touchscreens  
* Tablets  
* Landscape and portrait  
* Large buttons  
* High visibility  
* Outdoor/office lighting  
* Simple interaction

Avoid unnecessary animations.

---

# **6\. Face Recognition**

Face recognition must happen locally on the Android device.

DO NOT continuously upload camera frames to Firebase.

Architecture:

Camera  
↓  
Face detection  
↓  
Face alignment  
↓  
Face embedding  
↓  
Local comparison  
↓  
Employee identification  
↓  
Attendance event  
↓  
Firebase

The system should support employee enrollment.

Admin workflow:

Add Employee

Fields:

* Employee ID  
* Name  
* Employee type  
* Driver/Staff  
* Mobile number  
* Department  
* Active/inactive  
* Driver license information if already available in VGTC  
* Assigned truck if applicable

Face enrollment:

Capture multiple images from different angles and lighting conditions.

Generate a secure face embedding/template.

Do not store unnecessary raw face images.

Face templates must be protected.

---

# **7\. Fingerprint Architecture**

Fingerprint support must be modular.

Do NOT hard-code one fingerprint sensor.

Create an abstraction:

FingerprintProvider

with functions such as:

* initialize()  
* enroll()  
* identify()  
* verify()  
* isAvailable()  
* getDeviceInfo()

The first version should work without external fingerprint hardware.

Later support Android-compatible fingerprint hardware through a vendor SDK.

Do not purchase or depend on a fingerprint sensor until its Android SDK/API is confirmed.

---

# **8\. Employee Types**

VGTC must support:

## **Driver**

Driver-specific workflow.

## **Staff**

Normal office attendance workflow.

## **Admin**

Can manage terminal settings and enrollment.

## **Super Admin**

Can remotely manage all VGTC terminals.

---

# **9\. Driver Status Model**

Do NOT use only Present/Absent.

Create these states:

AVAILABLE

ON\_TRIP

RETURNING

RETURNED

OFF\_DUTY

LEAVE

ABSENT

UNKNOWN

The backend should determine the correct state.

---

# **10\. Driver Trip Logic**

This is one of the most important requirements.

Example:

Monday:

Driver scans face.

VGTC:

Driver \= Raj Kumar  
Status \= AVAILABLE

Order is assigned:

Order \= VG45821  
Truck \= HR XX 1234

Driver leaves.

VGTC:

Driver \= Raj Kumar  
Status \= ON\_TRIP  
Active Order \= VG45821

Tuesday:

Driver does not scan.

DO NOT mark him absent.

Instead:

Driver \= Raj Kumar  
Status \= ON\_TRIP  
Trip Day \= 2

Wednesday:

Driver returns and scans.

VGTC recognizes:

Driver \= Raj Kumar  
Active Trip \= VG45821

Show:

RETURN FROM TRIP

After confirmation:

Driver \= AVAILABLE  
Trip \= COMPLETED  
Truck \= AVAILABLE  
Order \= RETURNED/COMPLETED according to VGTC business rules

---

# **11\. Attendance Decision Engine**

Create a backend/service called:

VGTCAttendanceEngine

Input:

* employeeId  
* biometric type  
* timestamp  
* terminalId  
* current driver status  
* active trip  
* assigned truck  
* assigned order

Output:

* CHECK\_IN  
* CHECK\_OUT  
* TRIP\_RETURN  
* OFFICE\_VISIT  
* LEAVE  
* DUPLICATE  
* MANUAL\_REVIEW

Do not make business decisions only inside the Android application.

The backend must remain the source of truth.

---

# **12\. Driver Terminal Screen**

After recognition:

Example:

WELCOME

Raj Kumar

Driver ID: DRV102

Truck:  
HR XX 1234

Current Status:  
ON TRIP

Active Order:  
VG45821

Then display:

\[ RETURN FROM TRIP \]

\[ OFFICE VISIT \]

\[ CANCEL \]

If the backend determines the driver is not currently on a trip:

WELCOME

Raj Kumar

\[ CHECK IN \]

---

# **13\. Staff Attendance Screen**

For normal staff:

WELCOME

Amit Kumar

Employee ID: EMP205

08:42 AM

CHECK-IN SUCCESSFUL

Today's attendance:

Present

For checkout:

CHECK-OUT SUCCESSFUL

Working time:

8h 12m

---

# **14\. Duplicate Protection**

If an employee scans repeatedly within a configurable period:

Do not create duplicate attendance records.

Example:

Raj scans:

08:42:15

Then again:

08:42:22

Show:

"Attendance already recorded."

Configurable duplicate window:

Default: 60 seconds.

---

# **15\. Offline Mode**

The terminal MUST work without internet.

Local architecture:

Camera  
↓  
Local recognition  
↓  
Local database  
↓  
Attendance event queue  
↓  
Internet available  
↓  
Firebase synchronization

Every locally created event must have:

* UUID  
* employeeId  
* terminalId  
* eventType  
* timestamp  
* localTimestamp  
* syncStatus  
* createdAt

When internet returns:

Automatically synchronize pending events.

Use idempotency so the same event cannot be uploaded twice.

---

# **16\. Firebase Architecture**

Use Firebase for the backend.

Suggested services:

* Firebase Authentication  
* Cloud Firestore  
* Cloud Functions / appropriate backend services  
* Firebase App Hosting  
* Firebase Cloud Messaging if required  
* Firebase Storage only when genuinely necessary

Suggested collections:

employees

drivers

staff

attendance\_events

attendance\_daily

driver\_movements

trips

orders

trucks

terminals

terminal\_events

face\_templates

device\_config

sync\_queue

audit\_logs

---

# **17\. Example Attendance Event**

Create a structure similar to:

{  
"eventId": "UUID",  
"employeeId": "DRV102",  
"employeeType": "DRIVER",  
"terminalId": "OFFICE01",  
"eventType": "TRIP\_RETURN",  
"timestamp": "2026-09-18T08:42:15+05:30",  
"tripId": "TRIP45821",  
"orderId": "VG45821",  
"truckId": "HRXX1234",  
"recognitionMethod": "FACE",  
"syncStatus": "SYNCED"  
}

Do not expose sensitive biometric information unnecessarily.

---

# **18\. Terminal Registration**

Every device must have a unique:

terminalId

Example:

OFFICE-REWARI-01

The device should be registered with VGTC.

Terminal states:

ONLINE

OFFLINE

DISABLED

MAINTENANCE

UNKNOWN

Admin must be able to disable a compromised terminal.

---

# **19\. Device Security**

Implement:

* Device registration  
* Secure authentication  
* Device-specific credentials/tokens  
* HTTPS only  
* Encrypted local storage  
* Protected face templates  
* No hardcoded Firebase admin credentials  
* No API secrets inside frontend code  
* Audit logs  
* Session timeout  
* Admin PIN/password  
* Kiosk mode

Never put Firebase service-account credentials into the Android application.

---

# **20\. Kiosk Mode**

The terminal must eventually run as a dedicated kiosk.

Prevent users from:

* Exiting VGTC  
* Opening browser  
* Opening Settings  
* Installing applications  
* Accessing notifications  
* Changing Wi-Fi settings without authorization  
* Changing date/time manually  
* Rebooting into unwanted applications

Create an authorized admin escape mechanism.

Example:

Tap VGTC logo 7 times.

Then:

Admin PIN

After successful authentication:

Admin Settings

---

# **21\. Admin Settings**

Create:

Device Information

Terminal ID:  
OFFICE-REWARI-01

Network:  
Connected

Backend:  
Connected

Last Sync:  
10 seconds ago

Camera:  
OK

Face Engine:  
OK

Fingerprint:  
Not Connected

Storage:  
82%

Application Version:  
1.0.0

Buttons:

\[ Test Camera \]

\[ Test Recognition \]

\[ Sync Now \]

\[ Restart Application \]

\[ Device Diagnostics \]

---

# **22\. Remote Device Management**

Prepare the architecture for future remote management.

Admin portal should eventually show:

Terminal

OFFICE-REWARI-01

Status:  
ONLINE

Last Seen:  
10 seconds ago

Version:  
1.0.0

Battery:  
87%

Storage:  
82%

Camera:  
OK

Face Engine:  
OK

Allow future commands:

* Update configuration  
* Force sync  
* Restart application  
* Disable terminal  
* Update application  
* Send diagnostic request

Do not implement dangerous remote commands without authentication and audit logging.

---

# **23\. VGTC Portal Integration**

The attendance system must integrate with the existing VGTC transport management system.

Do not create a completely separate employee/trip/order system if VGTC already has those entities.

Use existing VGTC:

* Employee  
* Driver  
* Truck  
* Order  
* Trip  
* Driver assignment  
* User accounts

The attendance system should reference existing IDs.

Avoid duplicate records.

---

# **24\. Attendance Dashboard**

Add a VGTC admin dashboard.

Today's overview:

Total Staff  
Present  
Absent  
On Leave

Drivers:

Available  
On Trip  
Returned  
Expected  
Not Reported

Example:

DRIVERS

Available: 18

On Trip: 31

Returned Today: 7

Not Reported: 2

---

# **25\. Driver Movement Timeline**

Create a timeline:

Raj Kumar

08:32  
Face recognized

08:33  
Checked in

08:47  
Order VG45821 assigned

09:02  
Trip started

16 Sep  
On Trip

17 Sep  
On Trip

18 Sep  
Returned

08:42  
Trip return confirmed

08:45  
Driver available

---

# **26\. Geolocation**

Do not require GPS for basic attendance.

Prepare optional support for:

* GPS  
* Office geofence  
* Wi-Fi network verification

Future rule:

If terminal is registered to OFFICE01, attendance is associated with OFFICE01.

Later integrate VGTC truck GPS.

---

# **27\. Design System**

VGTC UI should look professional and industrial.

Use:

* VGTC branding  
* Large typography  
* Clean cards  
* Clear status indicators  
* Minimal interface  
* High contrast  
* Fast transitions  
* No unnecessary gradients  
* No generic "AI dashboard" appearance

The terminal must look like proprietary VGTC hardware/software.

---

# **28\. Project Structure**

Create a clean monorepo structure:

/vgtc-os

/android-terminal

/backend

/firebase

/shared

/admin-dashboard

/docs

Within Android:

/core

/face

/fingerprint

/attendance

/driver

/offline

/sync

/network

/security

/kiosk

/device

/ui

/settings

---

# **29\. Development Phases**

## **Phase 1 — Prototype**

Build on a normal Android tablet.

Implement:

* VGTC UI  
* Camera  
* Face recognition  
* Employee enrollment  
* Driver recognition  
* Staff attendance  
* Driver trip logic  
* Firebase integration  
* Offline mode  
* Synchronization

Do NOT modify the Android operating system yet.

---

## **Phase 2 — Dedicated Terminal**

Implement:

* Kiosk mode  
* Auto-start  
* Device registration  
* Admin mode  
* Device diagnostics  
* Remote configuration  
* Crash recovery  
* Automatic application restart  
* Secure device storage

---

## **Phase 3 — VGTC Android Shell**

Implement:

* Custom VGTC launcher  
* Hide standard Android UI  
* VGTC startup experience  
* Restricted system access  
* Dedicated-device behavior

---

## **Phase 4 — VGTC OS / AOSP**

Only after the previous phases are stable.

Create:

VGTC OS

based on an appropriate AOSP version.

Customize:

* Boot logo  
* Boot animation  
* Launcher  
* System UI  
* Device-owner behavior  
* System applications  
* OTA updates  
* VGTC device management

Do NOT assume every Android phone can run the custom ROM.

Maintain a supported-device list.

---

# **30\. Critical Requirement**

The first development target should be an ordinary Android tablet.

Do not start by trying to flash a custom ROM.

First prove:

Face recognition  
\+  
Attendance  
\+  
Driver trip logic  
\+  
Firebase  
\+  
Offline sync  
\+  
Kiosk mode

Once this works reliably, move toward the actual VGTC OS.

---

# **31\. Deliverables**

Produce:

1. Complete architecture  
2. Android project  
3. Firebase backend  
4. Firestore schema  
5. Face recognition module  
6. Offline synchronization  
7. Attendance engine  
8. Driver movement engine  
9. Kiosk mode  
10. VGTC terminal UI  
11. Admin dashboard  
12. Device registration  
13. Security model  
14. API documentation  
15. Testing plan  
16. Deployment instructions  
17. Supported-device requirements  
18. Future AOSP/VGTC OS architecture

---

# **32\. Coding Standards**

Use production-quality code.

Requirements:

* Modular architecture  
* Strong typing  
* Error handling  
* Logging  
* Unit tests  
* Integration tests  
* Offline tests  
* Network failure tests  
* Duplicate-event tests  
* Face recognition failure handling  
* Backend authorization  
* Audit logging

Do not use fake APIs in the final architecture.

During development, mocks are acceptable, but clearly isolate them.

---

# **33\. Start Now**

Start with Phase 1\.

First create:

1. Architecture  
2. Android project  
3. Firebase configuration  
4. Employee model  
5. Driver model  
6. Attendance event model  
7. Terminal model  
8. Face enrollment flow  
9. Face recognition flow  
10. Attendance engine  
11. Driver trip state engine  
12. Offline event queue  
13. Firebase synchronization  
14. Main VGTC terminal UI

Before implementing AOSP, create a working Android prototype and test it on a real Android phone/tablet.

The final product name should be:

**VGTC OS**

and the device should be referred to as:

**VGTC Attendance Terminal**

Do not use generic branding in the UI.

&nbsp;