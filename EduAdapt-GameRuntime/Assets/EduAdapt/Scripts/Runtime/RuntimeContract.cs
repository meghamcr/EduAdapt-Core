using System;

namespace EduAdapt.Runtime
{
    [Serializable]
    public class RuntimeGameData
    {
        public string runtimeVersion;
        public string gameId;
        public string sessionId;
        public string title;
        public string difficulty;
        public string adaptiveMode;

        public RuntimeFiction fiction;
        public RuntimeInstructionalPolicy instructionalPolicy;

        public RuntimePhase[] phases;
        public RuntimeChallenge[] challenges;

        public RuntimeVisuals visuals;
        public RuntimeReward reward;
        public RuntimeProgress progress;
    }

    [Serializable]
    public class RuntimeFiction
    {
        public string setting;
        public string character;
        public string narrative;
        public string dialogue;
    }

    [Serializable]
    public class RuntimeInstructionalPolicy
    {
        public string scaffoldingLevel;
        public bool hintsAllowed;
        public string guidanceLevel;
        public string challengeIntensity;
        public string reinforcementLevel;
    }

    [Serializable]
    public class RuntimePhase
    {
        public string id;
        public string type;
        public string instruction;
        public string[] teaching;
    }

    [Serializable]
    public class RuntimeChallenge
    {
        public string id;
        public string type;
        public string phaseId;
        public string instruction;
        public string prompt;
        public string[] choices;
        public string hint;
        public string telemetryKey;
        public ConstructionSpec construction;
    }

    [Serializable] public class BlockPiece { public string id; public int width,height,depth; }
    [Serializable] public class BlockPlacement { public string id; public int x,y,rotation; }
    [Serializable] public class ConstructionSpec { public string version,origin,materialRef,sourceText,assessment; public bool originalExerciseResolved; public int columns,rows; public BlockPiece[] pieces; public BlockPlacement[] target; }
    [Serializable]
    public class RuntimeVisuals
    {
        public string theme;
        public string[] assets;
    }

    [Serializable]
    public class RuntimeReward
    {
        public string type;
        public int quantity;
    }

    [Serializable]
    public class RuntimeProgress
    {
        public string status;
        public int sequence;
        public string phaseId;
        public string activeChallengeId;
        public int attempts;
        public int hintsUsed;
        public BlockPlacement[] placements;
        public RuntimeResolvedChallenge[] resolved;
    }

    [Serializable]
    public class RuntimeResolvedChallenge
    {
        public string challengeId;
        public bool completed;
        public bool skipped;
        public bool abandoned;
    }
}
