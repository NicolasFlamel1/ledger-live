import { Button } from "@ledgerhq/native-ui";
import React from "react";
import { Trans, useTranslation } from "react-i18next";
import AccountSectionLabel from "~/components/AccountSectionLabel";

type Props = {
  count: number;
  onPress: () => void;
};

export default function Header({ count, onPress }: Props) {
  const { t } = useTranslation();
  return (
    <AccountSectionLabel
      name={t("tron.voting.header", { total: count })}
      RightComponent={
        <Button type="main" onPress={onPress}>
          <Trans i18nKey="tron.voting.manageVotes" />
        </Button>
      }
    />
  );
}
