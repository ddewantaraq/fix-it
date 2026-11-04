import { useState } from "react";
import { CaptureHero } from "./components/CaptureHero";
import { GuideWorkspace } from "./components/GuideWorkspace";
import { Topbar } from "./components/Topbar";
import { useOwnerKey } from "./hooks/useOwnerKey";
import { usePalSession } from "./hooks/usePalSession";
import { usePlans } from "./hooks/usePlans";
import { PlanDetailPage } from "./pages/PlanDetailPage";
import { PlansPage } from "./pages/PlansPage";
import type { AppView } from "./types/session";

export function App() {
  const [view, setView] = useState<AppView>("home");
  const ownerKey = useOwnerKey();
  const session = usePalSession(ownerKey);
  const plans = usePlans({
    ownerKey,
    setBusy: session.setBusy,
    setBusyLabel: session.setBusyLabel,
    setError: session.setError,
    setCity: session.setCity,
    setConcern: session.setConcern,
    setPreviewUrl: session.setPreviewUrl,
    setView,
  });

  function onNewConcern() {
    session.resetCapture();
    plans.clearPlanDetail();
    setView("home");
  }

  return (
    <>
      <Topbar busy={session.busy} onOpenPlans={() => void plans.openPlans()} />

      {view === "plans" ? (
        <PlansPage
          busy={session.busy}
          error={session.error}
          summaries={plans.planSummaries}
          openingId={plans.openingPlanId}
          onRefresh={() => void plans.openPlans()}
          onBack={() => setView("home")}
          onNewConcern={onNewConcern}
          onOpen={(id) => void plans.openPlanDetail(id)}
        />
      ) : view === "plan-detail" && plans.planDetail ? (
        <PlanDetailPage
          error={session.error}
          busy={session.busy}
          planDetail={plans.planDetail}
          onBackToPlans={() => void plans.openPlans()}
          onNewConcern={onNewConcern}
          onToggleStep={(order, checked) => void plans.onToggleStep(order, checked)}
        />
      ) : !session.step ? (
        <CaptureHero
          error={session.error}
          busy={session.busy}
          busyLabel={session.busyLabel}
          geoBusy={session.geoBusy}
          placeHint={session.placeHint}
          photoObjectUrl={session.photoObjectUrl}
          dragOver={session.dragOver}
          file={session.file}
          onDragOverChange={session.setDragOver}
          onPhoto={session.onPhoto}
          onUseLocation={() => void session.onUseLocation()}
          onStart={() => void session.onStart()}
        />
      ) : (
        <GuideWorkspace
          phase={session.phase}
          error={session.error}
          busy={session.busy}
          busyLabel={session.busyLabel}
          photoSrc={session.photoSrc}
          city={session.city}
          placeHint={session.placeHint}
          concern={session.concern}
          transcript={session.transcript}
          step={session.step}
          messages={session.messages}
          answerValue={session.answerValue}
          logRef={session.logRef}
          planRef={session.planRef}
          onNewConcern={onNewConcern}
          onAnswerValue={session.setAnswerValue}
          onAnswer={(value, label) => void session.onAnswer(value, label)}
          onAcceptAction={() => void session.onAcceptAction()}
          onContinue={() => void session.onContinue()}
          onConcernVoice={(file) => void session.onConcernVoice(file)}
          onMicError={(message) => session.setError(message || null)}
        />
      )}
    </>
  );
}
