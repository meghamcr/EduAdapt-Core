using System;
using System.Collections;
using System.IO;
using System.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using EduAdapt.Runtime;

public class RuntimeHttpProofTests
{
    [Serializable] private class Endpoint { public string endpoint, versionId, levelId; }
    [Serializable] private class Endpoints { public Endpoint[] endpoints; }
    [Serializable] private class PlanRequest { public string curriculumArtifactVersionId, levelId, language = "en"; }
    [Serializable] private class PlannedGame { public string id; }
    [Serializable] private class Plan { public string planId, status; public PlannedGame[] games; }
    // This test is explicitly opt-in and runs against the repository's isolated
    // synthetic server. Missing configuration is a failure, never a silent pass.
    [UnityTest] public IEnumerator TwoSyntheticSubjectsReachServerEvidenceAndNextAdaptation()
    {
        var path = Environment.GetEnvironmentVariable("EDUADAPT_UNITY_PROOF");
        Assert.IsTrue(!string.IsNullOrEmpty(path) && File.Exists(path), "Start backend/tests/http/fixtures/unityProofServer.js and set EDUADAPT_UNITY_PROOF.");
        var endpoints = JsonUtility.FromJson<Endpoints>(File.ReadAllText(path)).endpoints;
        Assert.AreEqual(2, endpoints.Length);
        foreach (var target in endpoints)
        {
            var go = new GameObject("Synthetic runtime proof");
            var controller = go.AddComponent<RuntimeSessionController>(); var api = go.GetComponent<RuntimeApiClient>();
            controller.Configure(target.endpoint, "synthetic-proof-token");
            try
            {
                for (int session = 0; session < 3; session++)
                {
                    controller.PrepareLevel(target.versionId, target.levelId);
                    yield return Wait(controller);
                    var plan = controller.CurrentPlan; Assert.AreEqual("READY", plan.status);
                    Assert.IsTrue(plan.notes.SelectMany(n => n.materials).Any(m => m.text.Contains("eight")));
                    Assert.IsTrue(plan.deferred.Any(d => d.reason == "VISUAL_DEPENDENCY"));
                    controller.LaunchPlan(plan.planId, plan.games[0].id, "unity-proof-" + session);
                    yield return Wait(controller); Assert.NotNull(controller.Current);
                    Assert.AreEqual(session < 2 ? "EASY" : "MEDIUM", controller.Current.difficulty);
                    if (session == 2) break;
                    int guard = 0;
                    while (controller.Current.progress.status != "COMPLETED" && guard++ < 30)
                    {
                        var c = controller.Current.challenges.FirstOrDefault(c => c.id == controller.Current.progress.activeChallengeId);
                        if (c == null) controller.Continue();
                        else controller.SubmitChoice(Array.IndexOf(c.choices, c.id == "challenge1" ? "eight" : "four"));
                        yield return Wait(controller);
                    }
                    Assert.AreEqual("COMPLETED", controller.Current.progress.status);
                    Assert.AreEqual(2, controller.Current.progress.resolved.Length);
                    Assert.IsTrue(controller.Current.progress.resolved.All(r => r.completed && !r.skipped));
                    controller.Restore(controller.Current.sessionId); yield return Wait(controller);
                    Assert.AreEqual("COMPLETED", controller.Current.progress.status);
                    controller.RefreshLevel(); yield return Wait(controller);
                    Assert.IsNull(controller.Current); Assert.AreEqual("READY", controller.CurrentPlan.status);
                    controller.ReturnToCatalogue(); Assert.IsNull(controller.CurrentPlan);
                }
            }
            finally { UnityEngine.Object.DestroyImmediate(go); }
        }
    }
    private IEnumerator Wait(RuntimeSessionController c)
    {
        float deadline = Time.realtimeSinceStartup + 15;
        while (c.Busy && Time.realtimeSinceStartup < deadline) yield return null;
        Assert.IsFalse(c.Busy, "Local HTTP timed out."); Assert.IsNull(c.Error); Assert.IsFalse(c.HasPendingRequest);
    }
}
