# Turn on accounts (sign in with email, projects saved to the account)

About 15 minutes, free, no credit card. You need a Google account. Do it on a computer.

## 1. Create the Firebase project

1. Go to https://console.firebase.google.com and sign in with your Google account.
2. Click **Create a project** (or **Get started with a Firebase project**).
3. Name it `planline` and click **Continue**. Accept the terms if asked.
4. When asked about **Google Analytics**, switch it **off**, then click **Create project**. Wait, then click **Continue**.

## 2. Register the website and copy its settings

1. On the project's home page, click the **Web** icon (`</>`), under "Get started by adding Firebase to your app". If you don't see it: gear icon (top left) > **Project settings** > **Your apps** > **Add app** > **Web**.
2. App nickname: `Planline website`. Leave "Firebase Hosting" **unticked**. Click **Register app**.
3. You'll see a code box containing `const firebaseConfig = { apiKey: "...", authDomain: "...", projectId: "...", ... }`. Copy that whole `firebaseConfig = { ... }` part and keep it for step 6. (You can find it again later under gear icon > Project settings > Your apps.) Click **Continue to console**.

These values are not secret: every website using Firebase shows them. The security rules in step 5 are what protect the data.

## 3. Switch on email-link sign-in (and Google)

1. Left menu: **Build** (or **Security**) > **Authentication** > **Get started**.
2. Tab **Sign-in method** > **Email/Password**.
3. Switch on **Email/Password** (the first switch), then switch on **Email link (passwordless sign-in)** (the second switch). Click **Save**.
4. Click **Add new provider** > **Google**. Switch it on, pick your email as the "support email", click **Save**.
5. Tab **Settings** > **Authorized domains** > **Add domain**. Type `planline.app` and click **Add**. (`localhost` is already there; leave it.)

## 4. Create the database

1. Left menu: **Build** (or **Databases & Storage**) > **Firestore Database** > **Create database**.
2. If asked for an edition, choose **Standard**.
3. Location: pick the one closest to most of your users (for India, `asia-south1 (Mumbai)`). This cannot be changed later.
4. Choose **Start in production mode**, then **Create**.

## 5. Paste the security rules

1. In Firestore Database, open the **Rules** tab.
2. Delete everything in the box, and paste the whole content of [`firestore.rules`](firestore.rules) from this folder.
3. Click **Publish**.

These rules let each signed-in person read and change only their own projects. Nobody else, including other signed-in users, can see them.

## 6. Send the settings

Paste the `firebaseConfig` you copied in step 2 into the project chat. Claude will put it in `js/config.js` (`cloud.enabled: true`) and open a pull request. When you merge it, a **Sign in** button appears in the scheduler on https://planline.app/app/.

(If you prefer to do it yourself: edit `js/config.js` on GitHub, fill in `apiKey`, `authDomain`, `projectId` and `appId` inside `cloud.firebase`, set `cloud.enabled: true`, and commit to `main`.)

## Good to know

- **Cost.** The free Spark plan includes, per day, 50,000 document reads and 20,000 writes, and 1 GB of stored data in total. Each saved project is one document; the app batches quick edits into one save every few seconds and only reads all of a person's projects when they open the app or sign in. Usage is under **Usage and billing** in the console. On the Spark plan Firebase never charges you: if a limit were reached, saving to accounts would pause until the next day, and visitors' work would stay safe in their browser.
- **Sign-in emails** come from `noreply@<your-project>.firebaseapp.com`. You can change the wording under Authentication > **Templates**. Ask visitors to check their spam folder the first time.
- **Projects over 1 MB** (very large schedules) stay in the browser only; the app says so.
- **What is saved:** each project (tasks, dates, quantities, progress, settings). Example projects and the edited norms library stay in the browser.
- **Deleting accounts:** visitors can delete their account and all saved projects themselves from the account window. You can also see and delete users under Authentication > **Users**.
