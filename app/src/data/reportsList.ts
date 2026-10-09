export type Report = {
  season: number;
  week: number;
  title: string;
  path: string;
  pageCount: number;
  fileSize: number;
};

export const reportsList: Report[] = [
  {
    season: 2026,
    week: 2,
    title: "Ian Book Believers Weekly",
    path: "/reports/2026/week-02.pdf",
    pageCount: 1,
    fileSize: 128508,
  },
  {
    season: 2026,
    week: 3,
    title: "Ian Book Believers Weekly",
    path: "/reports/2026/week-03.pdf",
    pageCount: 1,
    fileSize: 126026,
  },
  {
    season: 2026,
    week: 4,
    title: "Ian Book Believers Weekly",
    path: "/reports/2026/week-04.pdf",
    pageCount: 1,
    fileSize: 127098,
  },
];
