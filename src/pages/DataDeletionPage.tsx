import { Link } from 'react-router-dom';
import LegalPageLayout, { LegalSection } from '@/components/LegalPageLayout';

const CONTACT_EMAIL = 'aleemyaseen39@gmail.com';

export default function DataDeletionPage() {
  return (
    <LegalPageLayout title="Data Deletion" updated="September 28, 2026">
      <p className="text-sm leading-relaxed text-gray-600">
        You can permanently delete your AdMafia account and the data associated with it at any time. This page
        explains exactly what that does and how to do it.
      </p>

      <LegalSection title="How to delete your account and data">
        <p>
          Sign in, go to <strong>Billing &amp; Account Settings</strong> (
          <Link to="/app/billing" className="font-medium text-gray-900 underline">/app/billing</Link>
          ), and use the <strong>Delete my account and data</strong> option in the Danger Zone at the bottom of the
          page. You'll be asked to confirm before anything is deleted, since this action cannot be undone.
        </p>
      </LegalSection>

      <LegalSection title="What gets deleted">
        <p>Requesting deletion permanently removes, immediately:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Your account itself (email and login).</li>
          <li>Your stored Meta, Google Ads, and TikTok connections, including the access and refresh tokens we held for them.</li>
          <li>Your connected ad account records (IDs and names we'd discovered).</li>
          <li>Your campaign briefs, including any product links you pasted in.</li>
          <li>Your uploaded product photos and any AI-generated or AI-edited ad images, deleted from storage.</li>
          <li>Your generated ad copy and creative history.</li>
          <li>Your published-ad records and their performance history (spend, clicks, impressions, conversions, revenue) stored in our database.</li>
          <li>Your product catalog entries (name, description, photo).</li>
          <li>Your plan/subscription record and usage counters.</li>
        </ul>
        <p>
          This deletes our copy of this data. It does not reach into Meta, Google, or TikTok and delete anything on
          those platforms themselves — for example, an ad you already published stays live on that platform, and any
          copy of your data those platforms retain is governed by their own privacy policies. To fully revoke
          AdMafia's access to a connected account, also remove AdMafia from that platform's own connected-apps
          settings — see Section 6 of our <a href="/privacy" className="font-medium text-gray-900 underline">Privacy Policy</a> for exact steps per platform.
        </p>
      </LegalSection>

      <LegalSection title="If you can't access your account">
        <p>
          If you can't sign in to use the in-app option, email <strong>{CONTACT_EMAIL}</strong> from the address on
          your account and ask us to delete it. We'll verify the request and delete the same data listed above.
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
