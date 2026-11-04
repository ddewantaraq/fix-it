import { useState } from "react";
import type { SessionDetail, SessionSummary } from "@iklim-pal/shared";
import { getSession, listSessions, updateProgress } from "../api";
import type { AppView } from "../types/session";

export function usePlans(opts: {
  ownerKey: string;
  setBusy: (v: boolean) => void;
  setBusyLabel: (v: string) => void;
  setError: (v: string | null) => void;
  setCity: (v: string) => void;
  setConcern: (v: string) => void;
  setPreviewUrl: (v: string | null) => void;
  setView: (v: AppView) => void;
}) {
  const {
    ownerKey,
    setBusy,
    setBusyLabel,
    setError,
    setCity,
    setConcern,
    setPreviewUrl,
    setView,
  } = opts;

  const [planSummaries, setPlanSummaries] = useState<SessionSummary[]>([]);
  const [planDetail, setPlanDetail] = useState<SessionDetail | null>(null);
  const [openingPlanId, setOpeningPlanId] = useState<string | null>(null);

  async function openPlans() {
    setError(null);
    setBusy(true);
    setBusyLabel("Loading plans…");
    try {
      const { sessions } = await listSessions(ownerKey);
      setPlanSummaries(sessions);
      setView("plans");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function openPlanDetail(id: string) {
    setError(null);
    setOpeningPlanId(id);
    setBusyLabel("Opening plan…");
    try {
      const detail = await getSession(id);
      setPlanDetail(detail);
      setCity(detail.session.city);
      setConcern(detail.session.concernText);
      setPreviewUrl(detail.session.photoUrl ?? null);
      setView("plan-detail");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setOpeningPlanId(null);
    }
  }

  async function onToggleStep(order: number, checked: boolean) {
    if (!planDetail) return;
    const current = new Set(planDetail.progress?.completedStepOrders ?? []);
    if (checked) current.add(order);
    else current.delete(order);
    setBusy(true);
    setError(null);
    try {
      const detail = await updateProgress(planDetail.session.id, [...current]);
      setPlanDetail(detail);
      const { sessions } = await listSessions(ownerKey);
      setPlanSummaries(sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function clearPlanDetail() {
    setPlanDetail(null);
  }

  return {
    planSummaries,
    planDetail,
    openingPlanId,
    openPlans,
    openPlanDetail,
    onToggleStep,
    clearPlanDetail,
  };
}
