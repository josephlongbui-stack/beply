import App from "../components/App";
import CloudGate from "../components/CloudGate";
import { cloudEnabled } from "../server/cloud/dispatch";
export const dynamic = "force-dynamic";
export default function Page() {
  return cloudEnabled() ? <CloudGate /> : <App />;
}
