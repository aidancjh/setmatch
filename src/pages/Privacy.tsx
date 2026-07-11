import { Link } from "react-router-dom";
import { VolleyballIcon } from "../components/icons";

/**
 * Public privacy policy — required for App Store / Google Play submission and
 * good practice generally. This is a sensible baseline; have it reviewed before
 * a real public launch.
 */
export default function Privacy() {
  return (
    <div className="mx-auto max-w-md bg-black px-6 py-10">
      <Link to="/" className="mb-6 flex items-center gap-2">
        <VolleyballIcon className="h-6 w-6 text-brand" />
        <span className="text-lg font-extrabold tracking-tight text-white">
          Vybe
        </span>
      </Link>

      <h1 className="mb-1 text-2xl font-bold text-white">Privacy Policy</h1>
      <p className="mb-6 text-sm text-slate-400">Last updated: June 2026</p>

      <div className="space-y-5 text-sm leading-relaxed text-slate-300">
        <section>
          <h2 className="mb-1 font-semibold text-white">What we collect</h2>
          <p>
            When you create an account we store your name, email address, and a
            securely hashed password. As you use Vybe we store the games you
            post or join, your skill level and home area, messages you post in
            game chats, any highlight photos you upload, and notifications
            generated for you.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-white">How we use it</h2>
          <p>
            Your information is used solely to run the app — showing games,
            letting players find and join each other, sending in-app
            notifications, and keeping your account secure. We do not sell your
            data or use it for advertising.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-white">What others see</h2>
          <p>
            Your display name and skill level are visible to other signed-in
            members on game rosters, profiles, and chat. Your email address and
            password are never shown to other users.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-white">Data storage</h2>
          <p>
            Data is stored in a managed PostgreSQL database. We take reasonable
            measures to protect it, including hashed passwords and encrypted
            connections. We rely on a few service providers to run Vybe —
            cloud hosting, an image host for uploaded photos, an email provider
            for account messages, and error-monitoring to keep the app stable —
            and we do not sell your data or use it for advertising.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-white">Your choices</h2>
          <p>
            You can edit your profile at any time. You can permanently delete
            your account and all associated data yourself from Settings → Delete
            account, or contact us using the email below and we'll remove it for
            you.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-white">Contact</h2>
          <p>
            Questions about your privacy? Email{" "}
            <a
              href="mailto:support@coterie.com.de"
              className="font-medium text-brand underline"
            >
              support@coterie.com.de
            </a>
            .
          </p>
        </section>
      </div>

      <Link
        to="/"
        className="mt-8 inline-block text-sm font-semibold text-brand underline"
      >
        ← Back to Vybe
      </Link>
    </div>
  );
}
