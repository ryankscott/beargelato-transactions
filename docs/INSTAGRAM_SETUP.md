# Instagram Graph API Setup

This project uses the Instagram Graph API to fetch posts, reels, stories, and account-level insights for correlation with Verifone sales data.

## Requirements

- An Instagram **Business** or **Creator** account.
- A Facebook Page linked to that Instagram account.
- A Facebook Developer account and app.

## Steps

### 1. Convert to a Business or Creator account

If your Instagram account is currently personal, convert it:

1. Open the Instagram app → Profile → Menu → Settings and privacy.
2. Go to **Account type and tools** → **Switch to professional account**.
3. Choose **Business** or **Creator**.

### 2. Link the Instagram account to a Facebook Page

1. In the Instagram app, go to **Settings and privacy** → **Account type and tools** → **Creator tools and controls** → **Page**.
2. Connect an existing Facebook Page or create a new one.
3. You must be an admin of the Facebook Page.

### 3. Create a Facebook app

1. Go to [Meta for Developers](https://developers.facebook.com/).
2. Create a new app (type: **Business**).
3. Add the **Instagram Graph API** product to the app.

### 4. Add required permissions

In your app dashboard, make sure these permissions are requested:

- `instagram_basic`
- `instagram_manage_insights`
- `pages_read_engagement`

You may need to go through **App Review** to use these permissions with non-test users.

### 5. Generate a long-lived access token

The sync script needs a long-lived token. The easiest path is:

1. In the Facebook app dashboard, go to **Tools** → **Graph API Explorer**.
2. Select your app and generate a User Access Token with the required permissions.
3. Exchange the short-lived token for a long-lived token using:

```bash
curl -X GET "https://graph.facebook.com/v22.0/oauth/access_token?grant_type=fb_exchange_token&client_id=YOUR_APP_ID&client_secret=YOUR_APP_SECRET&fb_exchange_token=YOUR_SHORT_LIVED_TOKEN"
```

Save the returned `access_token` as `INSTAGRAM_ACCESS_TOKEN`.

### 6. Find your IDs

**Page ID:**
- In the Graph API Explorer, run `GET /me/accounts` with your token.
- Copy the `id` of the linked page.

**Instagram User ID:**
- Run `GET /{page-id}?fields=instagram_business_account`.
- Copy the `instagram_business_account.id` value.

### 7. Configure this project

Copy `.env.example` to `.env` and fill in:

```env
INSTAGRAM_APP_ID=your-app-id
INSTAGRAM_APP_SECRET=your-app-secret
INSTAGRAM_ACCESS_TOKEN=your-long-lived-token
INSTAGRAM_PAGE_ID=your-page-id
INSTAGRAM_USER_ID=your-ig-user-id
```

### 8. Test

Run:

```bash
bun instagram_sync.ts
```

If everything is configured correctly, media and metrics will be fetched into `transactions.db`.

## Token refresh

Long-lived user tokens are valid for **60 days** and can be refreshed before expiry by calling:

```bash
curl -X GET "https://graph.facebook.com/v22.0/{ig-user-id}?fields=access_token&access_token=YOUR_LONG_LIVED_TOKEN"
```

Store the new token and update `INSTAGRAM_ACCESS_TOKEN` in `.env`.

## Useful references

- [Instagram Graph API overview](https://developers.facebook.com/docs/instagram-api)
- [Instagram Insights API](https://developers.facebook.com/docs/instagram-api/reference/ig-user/insights)
- [Media insights](https://developers.facebook.com/docs/instagram-api/reference/ig-media/insights)
