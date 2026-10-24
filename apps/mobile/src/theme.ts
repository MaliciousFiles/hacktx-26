import { Platform } from "react-native";

export const colors = {
  bg: "#F3EDE2",
  card: "#FFFBF6",
  ink: "#1C1915",
  inkSoft: "#5E564C",
  line: "#E0D3C2",
  forest: "#1E4636",
  forestSoft: "#E4EFE8",
  gold: "#8A6830",
  goldSoft: "#F4E7CB",
  rose: "#8E3344",
  roseSoft: "#F8E8EA",
};

export const serif = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "Georgia",
});
