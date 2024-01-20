import React from "react";
import { TrackScreen } from "~/analytics";
import CountervalueSettingsRow from "./CountervalueSettingsRow";
import ThemeSettingsRow from "./ThemeSettingsRow";
import AuthSecurityToggle from "./AuthSecurityToggle";
import ReportErrorsRow from "./ReportErrorsRow";
import AnalyticsRow from "./AnalyticsRow";
import LanguageRow from "./LanguageRow";
import SettingsNavigationScrollView from "../SettingsNavigationScrollView";
import DateFormatRow from "./DateFormatRow";
import PersonnalizedRecommendationsRow from "./PersonnalizedRecommendationsRow";
import { FeatureToggle } from "@ledgerhq/live-config/featureFlags/index";

export default function GeneralSettings() {
  return (
    <SettingsNavigationScrollView>
      <TrackScreen category="Settings" name="General" />
      <CountervalueSettingsRow />
      <LanguageRow />
      <DateFormatRow />
      <ThemeSettingsRow />
      <AuthSecurityToggle />
      <ReportErrorsRow />
      <AnalyticsRow />
      <FeatureToggle featureId="llmAnalyticsOptInPrompt">
        <PersonnalizedRecommendationsRow />
      </FeatureToggle>
    </SettingsNavigationScrollView>
  );
}
