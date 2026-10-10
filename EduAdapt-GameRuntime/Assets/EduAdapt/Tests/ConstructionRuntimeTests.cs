using System;
using System.Collections;
using System.IO;
using System.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using EduAdapt.Runtime;

public class ConstructionRuntimeTests
{
    [Serializable] private class Scope {public string endpoint,versionId,levelId;}
    [Serializable] private class Connection {public string token,generationStatus;public Scope[] endpoints;}
    [Test] public void OriginalPixelFontIsBundled()
    {
        var font=Resources.Load<Font>("Fonts/PressStart2P-Regular");
        Assert.NotNull(font);Assert.AreSame(font,PixelTheme.Font);
        Assert.IsTrue(font.HasCharacter('A'));Assert.IsTrue(font.HasCharacter('0'));
    }
    [Test] public void ConstructionResponseContainsPlacementsAndNoCorrectness()
    {
        var response=RuntimeProtocol.Answer("event","challenge",new[]{new BlockPlacement{id="a",x=1,y=2,rotation=1},new BlockPlacement{id="b",x=0,y=0,rotation=0}});
        StringAssert.Contains("\"rotation\":1",response);StringAssert.DoesNotContain("correctness",response);StringAssert.DoesNotContain("target",response);
        Assert.IsFalse(RuntimeProtocol.ValidConstruction(null));
    }
    [UnityTest] public IEnumerator FixtureConstructionRetriesRestoresAndCompletesThroughHttp()
    {
        var file=Environment.GetEnvironmentVariable("EDUADAPT_CONSTRUCTION_PROOF");
        Assert.IsTrue(!string.IsNullOrEmpty(file)&&File.Exists(file),"Start the isolated construction runtime and provide its connection file.");
        var connection=JsonUtility.FromJson<Connection>(File.ReadAllText(file));
        Assert.AreEqual("DEVELOPMENT_FIXTURE_NOT_AI_GENERATED",connection.generationStatus);
        var scope=connection.endpoints[0];var go=new GameObject("Generic construction HTTP verification");
        var controller=go.AddComponent<RuntimeSessionController>();
        try
        {
            controller.Configure(scope.endpoint,connection.token);
            controller.PrepareLevel(scope.versionId,scope.levelId);yield return Wait(controller);
            var plan=controller.CurrentPlan;Assert.NotNull(plan);
            controller.LaunchPlan(plan.planId,plan.games.First(g=>g.mechanic=="CONSTRUCTION").id,Guid.NewGuid().ToString("N"));yield return Wait(controller);
            int guard=0;
            while(string.IsNullOrEmpty(controller.Current.progress.activeChallengeId)&&guard++<12){controller.Continue();yield return Wait(controller);}
            var c=controller.Current.challenges.First(c=>c.id==controller.Current.progress.activeChallengeId);
            Assert.IsTrue(RuntimeProtocol.ValidConstruction(c.construction));
            var wrong=c.construction.target.Select(p=>new BlockPlacement{id=p.id,x=p.x,y=p.y,rotation=p.rotation}).ToArray();
            wrong[1].rotation=1-wrong[1].rotation;
            controller.SubmitConstruction(wrong);yield return Wait(controller);
            Assert.AreEqual(1,controller.Current.progress.attempts);StringAssert.Contains("Keep building",controller.Feedback);
            controller.Hint();yield return Wait(controller);Assert.AreEqual(1,controller.Current.progress.hintsUsed);StringAssert.Contains("bottom row",controller.Feedback);
            var id=controller.Current.sessionId;controller.Restore(id);yield return Wait(controller);
            Assert.AreEqual(1,controller.Current.progress.attempts);Assert.AreEqual(wrong[1].rotation,controller.Current.progress.placements[1].rotation);
            controller.SubmitConstruction(c.construction.target);yield return Wait(controller);StringAssert.Contains("matches the generated reference",controller.Feedback);
            guard=0;while(controller.Current.progress.status!="COMPLETED"&&guard++<8){controller.Continue();yield return Wait(controller);}
            Assert.AreEqual("COMPLETED",controller.Current.progress.status);Assert.IsTrue(controller.Current.progress.resolved.All(r=>r.completed&&!r.skipped));
            controller.Restore(id);yield return Wait(controller);Assert.AreEqual("COMPLETED",controller.Current.progress.status);
            controller.RefreshLevel();yield return Wait(controller);Assert.NotNull(controller.CurrentPlan);Assert.IsNull(controller.Current);
            controller.ReturnToCatalogue();Assert.IsNull(controller.CurrentPlan);
        }
        finally{UnityEngine.Object.DestroyImmediate(go);}
    }
    private IEnumerator Wait(RuntimeSessionController c)
    {
        var deadline=Time.realtimeSinceStartup+15;
        while(c.Busy&&Time.realtimeSinceStartup<deadline)yield return null;
        Assert.IsFalse(c.Busy);Assert.IsNull(c.Error);Assert.IsFalse(c.HasPendingRequest);
    }
}
