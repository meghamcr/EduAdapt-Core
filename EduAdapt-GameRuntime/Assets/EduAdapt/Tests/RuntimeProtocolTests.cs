using System;
using NUnit.Framework;
using UnityEngine;
using EduAdapt.Runtime;

public class RuntimeProtocolTests
{
    private RuntimeGameData Example() => JsonUtility.FromJson<RuntimeGameData>(Resources.Load<TextAsset>("RuntimeTests/runtime-example").text);
    [Test] public void ExistingBackendContractParses() { Assert.IsTrue(RuntimeProtocol.IsValid(Example())); }
    [Test] public void MechanicRegistryDispatchesOnlyDeclaredContractCapabilities()
    {
        var registry = new RuntimeMechanicRegistry();
        foreach (var type in RuntimeProtocol.Mechanics)
        {
            Assert.IsTrue(registry.TryGet(type, out var renderer));
            Assert.NotNull(renderer);
        }
        Assert.IsTrue(registry.TryGet("CONSTRUCTION", out _));
        Assert.IsFalse(registry.TryGet("Chapter1", out _));
        Assert.IsFalse(registry.TryGet(null, out _));
    }
    [Test] public void ResolvedProgressUsesObjects()
    {
        var p = JsonUtility.FromJson<RuntimeProgress>("{\"status\":\"STARTED\",\"resolved\":[{\"challengeId\":\"c1\",\"completed\":true,\"skipped\":false,\"abandoned\":false}]}");
        Assert.AreEqual("c1", p.resolved[0].challengeId); Assert.IsTrue(p.resolved[0].completed);
    }
    [Test] public void TypedAnswersHaveExactMinimalFields()
    {
        Assert.AreEqual("{\"eventId\":\"e1\",\"type\":\"ANSWER_SUBMITTED\",\"challengeId\":\"c1\",\"response\":0}", RuntimeProtocol.Answer("e1", "c1", 0));
        var text = RuntimeProtocol.Answer("e1", "c1", "a\"b\n");
        StringAssert.Contains("a\\\"b\\n", text); StringAssert.DoesNotContain("correctness", text); StringAssert.DoesNotContain("mastery", text);
    }
    [Test] public void RemediationHasItsOwnEvent() { StringAssert.Contains("REMEDIATION_STARTED", RuntimeProtocol.Phase("e", new RuntimePhase { id = "remediate", type = "REMEDIATION" })); }
    [Test] public void UnsupportedMechanicsReject() { var g = Example(); g.challenges[0].type = "CONSTRUCTION"; Assert.IsFalse(RuntimeProtocol.IsValid(g)); }
    [Test] public void UnknownProgressAndDuplicateIdsReject()
    {
        var g = Example(); g.progress.activeChallengeId = "missing"; Assert.IsFalse(RuntimeProtocol.IsValid(g));
        g = Example(); g.phases[1].id = g.phases[0].id; Assert.IsFalse(RuntimeProtocol.IsValid(g));
    }
    [TestCase("DEMONSTRATE")][TestCase("CORE_GAMEPLAY")][TestCase("ADAPTIVE_CHALLENGE")][TestCase("MASTERY_CHECK")]
    public void AllBackendPhasesAreSupported(string phase) { var g = Example(); g.phases[1].type = phase; Assert.IsTrue(RuntimeProtocol.IsValid(g)); }
    [Test] public void CredentialConfigurationRejectsRedirectAndPlaintextRemoteTargets()
    {
        var go = new GameObject("Synthetic API test");
        try
        {
            var api = go.AddComponent<RuntimeApiClient>();
            foreach (var endpoint in new[] { "http://example.test", "https://user:pass@example.test", "https://example.test/?token=x", "https://example.test/path" })
                Assert.Throws<ArgumentException>(() => api.Configure(endpoint, "synthetic-token"));
            api.Configure("http://127.0.0.1:1234", "synthetic-token"); Assert.IsTrue(api.Configured);
            StringAssert.DoesNotContain("synthetic-token", JsonUtility.ToJson(api)); api.ClearCredential(); Assert.IsFalse(api.Configured);
        }
        finally { UnityEngine.Object.DestroyImmediate(go); }
    }
}
