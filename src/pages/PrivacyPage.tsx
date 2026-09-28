import LegalPageLayout, { LegalSection } from '@/components/LegalPageLayout';

const CONTACT_EMAIL = 'aleemyaseen39@gmail.com';
const COMPANY_NAME = 'AdMafia';

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" updated="September 28, 2026">
      <p className="text-sm leading-relaxed text-gray-600">
        This Privacy Policy explains what information AdMafia ("we", "us", operated by {COMPANY_NAME}) collects when
        you use the AdMafia application, how we use it, and the choices you have. It describes our actual data
        practices as implemented in the product — not general or aspirational claims.
      </p>

      <LegalSection title="1. Information we collect">
        <p><strong>Account information.</strong> When you create an account, we collect your email address. Authentication is handled by our database provider, Supabase, and supports both email/password sign-in and "Continue with Google" sign-in.</p>
        <p><strong>Plan and usage information.</strong> We store which plan you're on (Starter, Growth, or Agency) and a count of how many AI generations you've used this billing period.</p>
        <p><strong>Ad platform connections.</strong> When you connect a Meta, Google Ads, or TikTok ad account, we receive and store the OAuth access token and refresh token for that connection, the token's granted scope and expiry, the platform's internal user ID for that connection, and the ad account ID(s) and name(s) we discover through that connection. These tokens are stored in a database table that is never exposed to the app's frontend and is only readable by our backend server functions, using a separate, privileged database key.</p>
        <p><strong>Campaign content you provide.</strong> This includes the free-text campaign brief you write, any product page link(s) you paste in, and any product photos you upload. Uploaded photos are stored as files in our storage provider (Supabase Storage).</p>
        <p><strong>Product catalog.</strong> If you use the Products feature, we store the product name, description, and photo you enter.</p>
        <p><strong>AI-generated output.</strong> We store the ad copy (headline, body, call-to-action) and ad images produced for you, along with the approved/published version of that copy and creative for each ad account you publish to.</p>
        <p><strong>Ad performance data.</strong> For ads you publish, we store performance figures (spend, clicks, impressions, conversions, revenue) associated with that ad.</p>
        <p>We do not collect payment card details ourselves. Our database schema has fields reserved for a future billing-processor integration, but as of this policy's effective date the app does not transmit your data to a separate payment processor; changing your plan updates our own records directly.</p>
      </LegalSection>

      <LegalSection title="2. How we use this information">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>To authenticate you and operate your account.</li>
          <li>To connect to, and act on your behalf with, the ad platforms you authorize (discovering ad accounts, publishing ads, retrieving performance metrics).</li>
          <li>To generate ad copy and ad images using your campaign brief, product links, and product photos, via our AI provider.</li>
          <li>To display your campaigns, connections, generated creative, and performance data back to you inside the app.</li>
          <li>To enforce plan usage limits (e.g. generations per month).</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Who we share it with">
        <p>We share information with the following service providers, only as needed to provide the features above:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>Supabase</strong> — our database, authentication, file storage, and backend server-function host. All of the data categories above pass through or are stored with Supabase.</li>
          <li><strong>OpenAI</strong> — we send your campaign brief text, and, if you provide one, an uploaded product photo, to OpenAI's API to generate ad copy and to generate or edit ad images. OpenAI processes this content to return the generated result to us.</li>
          <li><strong>Netlify</strong> — hosts the AdMafia web application you're using right now.</li>
          <li><strong>Meta, Google (Google Ads), and TikTok</strong> — when you connect an ad account on one of these platforms, we exchange authentication codes and tokens with that platform, and send it the ad content and budget you approve for publishing, and read back your ad account list and performance metrics. Each of those platforms is also an independent data controller for the information it holds about your ad account.</li>
        </ul>
        <p>We do not sell your personal data, and we do not share it with third parties for their own independent marketing purposes.</p>
      </LegalSection>

      <LegalSection title="4. Storage and security">
        <p>Application data is stored in a Supabase-hosted database. Row-level security rules restrict most tables so that a signed-in user can only read or write their own rows. Ad platform access and refresh tokens are stored in a separate table that is not reachable through the app's normal (row-level-secured) client access at all — only our backend server functions, using a privileged service key, can read it.</p>
        <p>Uploaded product photos and AI-generated ad images are stored as files, each reachable only via a randomly generated, unguessable file path.</p>
        <p>We have not obtained any third-party security certification (e.g. SOC 2, ISO 27001) for AdMafia, and we make no claim to that effect.</p>
      </LegalSection>

      <LegalSection title="5. Data retention">
        <p>We retain your account and campaign data for as long as your account remains open, so that you can continue to use the app's history, connections, and generated creative. If you disconnect an ad account, we stop using its stored token immediately and remove the connection record; see Section 6. If you delete your account, see our <a href="/data-deletion" className="font-medium text-gray-900 underline">Data Deletion</a> page for what is removed and how.</p>
        <p>We have not set a fixed automatic retention period for closed or inactive accounts beyond what's described above, and we make no claim about one.</p>
      </LegalSection>

      <LegalSection title="6. Disconnecting an ad account and revoking access">
        <p>You can disconnect a Meta, Google Ads, or TikTok ad account at any time from the Connections page in the app. Disconnecting removes our stored record of that connection. Because the underlying access token was granted through that platform's own OAuth consent, we also recommend revoking AdMafia's access directly from the platform itself:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>Meta:</strong> Facebook Business Settings → Integrations → Apps, or Facebook Settings → Apps and Websites.</li>
          <li><strong>Google:</strong> Google Account → Security → Third-party apps with account access.</li>
          <li><strong>TikTok:</strong> TikTok app settings → Manage account → Apps and websites, or the TikTok for Developers Sandbox/App dashboard if you connected via a developer sandbox.</li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Your rights">
        <p>Depending on where you live, you may have rights to access, correct, export, or delete the personal data we hold about you, and to object to or restrict certain processing. You can exercise most of these rights directly in the app (editing your campaign content, disconnecting ad accounts, deleting products) or by deleting your account entirely, as described on our <a href="/data-deletion" className="font-medium text-gray-900 underline">Data Deletion</a> page. For anything you can't do directly in the app, contact us at {CONTACT_EMAIL}.</p>
      </LegalSection>

      <LegalSection title="8. Children's privacy">
        <p>AdMafia is intended for business use and is not directed at children. We do not knowingly collect personal data from children.</p>
      </LegalSection>

      <LegalSection title="9. Changes to this policy">
        <p>If we make material changes to this policy, we'll update the effective date above. Continued use of AdMafia after a change means you accept the updated policy.</p>
      </LegalSection>

      <LegalSection title="10. Contact us">
        <p>Questions about this policy or your data can be sent to {CONTACT_EMAIL}.</p>
      </LegalSection>
    </LegalPageLayout>
  );
}
