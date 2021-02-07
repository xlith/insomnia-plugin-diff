const {
  remote: { BrowserWindow },
} = require("electron");
const fs = require("fs");
const path = require("path");
const Diff = require("diff");
const Diff2html = require("diff2html");

const createResultWindow = (content) => {
  const resultWindow = new BrowserWindow({
    autoHideMenuBar: true,
    show: false,
  });
  resultWindow.loadURL(content);
  resultWindow.show();
  resultWindow.maximize();
};
const header = `
<html lang="en">
 <head>
  <title>Response Diff</title>
  <style>${fs.readFileSync(
    path.join(
      __dirname,
      "/node_modules/diff2html/bundles/css/diff2html.min.css"
    )
  )}</style>
 </head>
 <body>`;

const footer = `
  <footer>
    This module is in early development please report to https://github.com/xlith/insomnia-plugin-diff
  </footer>
 </body>
</html>`;

const getFolders = async (context, workspace) => {
  const ex = await context.data.export.insomnia({
    includePrivate: false,
    format: "json",
    workspace: workspace,
  });
  const { resources } = JSON.parse(ex);
  return resources.filter(
    (value) =>
      value._type === "request_group" && value.parentId.startsWith("wrk_")
  );
};

const getDiffFolders = async (context, workspace) => {
  let diffFolder0, diffFolder1;
  const folders = await getFolders(context, workspace);

  try {
    diffFolder0 = await context.app.prompt("First Diff Folder? (1/2)", {
      label: "1. folder",
      defaultValue: folders[0].name,
      cancelable: true,
      submitName: "Next",
    });
    diffFolder1 = await context.app.prompt("Second Diff Folder? (2/2)", {
      label: "2. folder",
      defaultValue: folders[1].name,
      cancelable: true,
      submitName: "Done",
    });
  } catch (err) {
    console.error(err);
  }

  return folders.filter(
    (item) => item.name === diffFolder1 || item.name === diffFolder0
  );
};

const getDiffRequests = async (context, workspace) => {
  const diffFolders = await getDiffFolders(context, workspace);

  const ex = await context.data.export.insomnia({
    includePrivate: false,
    format: "json",
    workspace: workspace,
  });

  const { resources } = JSON.parse(ex);
  const diffRequests0 = resources.filter(
    (value) =>
      value._type === "request" && value.parentId === diffFolders[0]._id
  );
  const diffRequests1 = resources.filter(
    (value) =>
      value._type === "request" && value.parentId === diffFolders[1]._id
  );

  return diffRequests0.map((item0) => [
    item0,
    diffRequests1.filter((item1) => item1.name === item0.name)[0],
  ]);
};

const sendRequestPair = async (requestsPair, context) => {
  let results = [];
  for (let i = 0; i < 2; i++) {
    const response = await context.network.sendRequest(requestsPair[i]);
    results.push({
      name: requestsPair[i].name,
      res: fs.readFileSync(response.bodyPath).toString(),
    });
  }
  return results;
};

const getPairDiff = (results) => {
  return Diff.createTwoFilesPatch(
    results[0].name,
    results[1].name,
    results[0].res,
    results[1].res
  );
};

const renderDiffHtml = (diff) => {
  const diffJson = Diff2html.parse(diff);
  const diffHtml = Diff2html.html(diffJson, {
    drawFileList: true,
    outputFormat: "side-by-side",
  });

  return diffHtml;
};

const gAction = async (context, { requestGroup, requests }) => {
  const results = await sendRequestPair(requests, context);
  const diff = getPairDiff(results);

  const html = header + renderDiffHtml(diff) + footer;
  const content = "data:text/html;charset=UTF-8," + encodeURIComponent(html);
  createResultWindow(content);
};

const wAction = async (context, { workspace, requestGroup, requests }) => {
  const diffRequests = await getDiffRequests(context, workspace);

  const diffArray = await Promise.all(
    diffRequests.map(async (item) => {
      const results = await sendRequestPair(item, context);
      return getPairDiff(results);
    })
  );

  const html = header + renderDiffHtml(diffArray.join("")) + footer;
  const content = "data:text/html;charset=UTF-8," + encodeURIComponent(html);
  createResultWindow(content);
};

const RequestGroupAction = {
  label: "Diff Requests",
  icon: "fa-columns",
  action: gAction,
};

const WorkspaceAction = {
  label: "Diff Requests",
  icon: "fa-columns",
  action: wAction,
};

module.exports.workspaceActions = [WorkspaceAction];

module.exports.requestGroupActions = [RequestGroupAction];
