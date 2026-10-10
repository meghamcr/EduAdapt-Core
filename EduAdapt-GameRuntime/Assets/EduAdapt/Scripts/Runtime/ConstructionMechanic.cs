using System;
using System.Linq;
using UnityEngine;
using UnityEngine.InputSystem;
namespace EduAdapt.Runtime
{
    // Generic integer-grid cuboids. The target is a visible reference, not a client
    // answer key: every submitted arrangement is evaluated by the server.
    public sealed class ConstructionMechanic : IRuntimeMechanic
    {
        private string key;
        private BlockPlacement[] placements;
        private int selected=-1,dragging=-1,lastFrame=-1,restoredSequence=-1;
        private Vector2 dragOffset;
        public BlockPlacement[] Placements => placements;
        public void Draw(RuntimeChallenge c,GUIStyle button,Action<string> text,Action<int> choice){}
        public void DrawInteractive(Rect area,RuntimeChallenge c,RuntimeProgress progress,Action<BlockPlacement[]> submit,bool enabled,bool assessed=true,string instanceKey="")
        {
            var s=c.construction;
            if(key!=instanceKey+c.id){key=instanceKey+c.id;selected=dragging=-1;restoredSequence=-1;
                placements=s.pieces.Select((p,i)=>new BlockPlacement{id=p.id,x=0,y=Mathf.Min(i,s.rows-1),rotation=0}).ToArray();}
            if(progress.placements!=null&&progress.attempts!=restoredSequence){placements=progress.placements.Select(p=>new BlockPlacement{id=p.id,x=p.x,y=p.y,rotation=p.rotation}).ToArray();restoredSequence=progress.attempts;}
            var cell=Mathf.Min((area.width-60)/(s.columns*2), (area.height-110)/s.rows);
            var reference=new Rect(area.x,area.y+30,s.columns*cell,s.rows*cell);
            var board=new Rect(reference.xMax+40,reference.y,reference.width,reference.height);
            GUI.Label(new Rect(reference.x,area.y,reference.width,30),"GENERATED REFERENCE");
            GUI.Label(new Rect(board.x,area.y,board.width,30),"YOUR MODEL");
            Grid(reference,s,cell);Grid(board,s,cell);
            for(int i=0;i<s.pieces.Length;i++)DrawBlock(reference,s,cell,s.pieces[i],s.target.First(p=>p.id==s.pieces[i].id),false);
            // New Input System pointer/keyboard only, processed once per frame.
            if(enabled&&lastFrame!=Time.frameCount){lastFrame=Time.frameCount;
                var pointer=Pointer.current;
                if(pointer!=null){var v=pointer.position.ReadValue();var mouse=new Vector2(v.x,Screen.height-v.y);
                    if(pointer.press.wasPressedThisFrame){for(int i=placements.Length-1;i>=0;i--)if(BlockRect(board,s,cell,s.pieces[i],placements[i]).Contains(mouse)){selected=dragging=i;dragOffset=mouse-BlockRect(board,s,cell,s.pieces[i],placements[i]).position;break;}}
                    if(dragging>=0&&pointer.press.isPressed){var p=placements[dragging];var b=s.pieces[dragging];int w=p.rotation==0?b.width:b.height,h=p.rotation==0?b.height:b.width;
                        p.x=Mathf.Clamp(Mathf.RoundToInt((mouse.x-dragOffset.x-board.x)/cell),0,s.columns-w);
                        p.y=Mathf.Clamp(s.rows-h-Mathf.RoundToInt((mouse.y-dragOffset.y-board.y)/cell),0,s.rows-h);}
                    if(pointer.press.wasReleasedThisFrame)dragging=-1;
                }
                var keyboard=Keyboard.current;
                if(keyboard!=null){
                    for(int i=0;i<placements.Length;i++)if(keyboard[(Key)((int)Key.Digit1+i)].wasPressedThisFrame)selected=i;
                    if(keyboard.rKey.wasPressedThisFrame)Rotate(s);
                    if(selected>=0){var p=placements[selected];var b=s.pieces[selected];
                        if(keyboard.leftArrowKey.wasPressedThisFrame)p.x--;if(keyboard.rightArrowKey.wasPressedThisFrame)p.x++;
                        if(keyboard.downArrowKey.wasPressedThisFrame)p.y--;if(keyboard.upArrowKey.wasPressedThisFrame)p.y++;
                        p.x=Mathf.Clamp(p.x,0,s.columns-(p.rotation==0?b.width:b.height));p.y=Mathf.Clamp(p.y,0,s.rows-(p.rotation==0?b.height:b.width));}
                    if(assessed&&keyboard.enterKey.wasPressedThisFrame)submit(placements.Select(p=>new BlockPlacement{id=p.id,x=p.x,y=p.y,rotation=p.rotation}).ToArray());
                }
            }
            for(int i=0;i<s.pieces.Length;i++)DrawBlock(board,s,cell,s.pieces[i],placements[i],selected==i);
            var buttonsY=board.yMax+12;
            GUI.enabled=enabled;
            if(GUI.Button(new Rect(area.x,buttonsY,200,44),"Rotate [R]"))Rotate(s);
            if(assessed && GUI.Button(new Rect(area.x+215,buttonsY,240,44),"Check model [Enter]"))submit(placements.Select(p=>new BlockPlacement{id=p.id,x=p.x,y=p.y,rotation=p.rotation}).ToArray());
            GUI.Label(new Rect(area.x,buttonsY+46,area.width,44),"Drag blocks, or select 1-8 and move with arrows. R rotates. Match the coloured reference blocks.");
            GUI.enabled=true;
        }
        private void Rotate(ConstructionSpec s){if(selected<0)return;var p=placements[selected];p.rotation=1-p.rotation;var b=s.pieces[selected];p.x=Mathf.Clamp(p.x,0,s.columns-(p.rotation==0?b.width:b.height));p.y=Mathf.Clamp(p.y,0,s.rows-(p.rotation==0?b.height:b.width));}
        private static void Grid(Rect r,ConstructionSpec s,float cell){PixelTheme.Frame(new Rect(r.x-3,r.y-3,r.width+6,r.height+6),PixelTheme.Green);for(int x=0;x<=s.columns;x++)PixelTheme.Fill(new Rect(r.x+x*cell,r.y,1,r.height),new Color(.15f,.25f,.32f));for(int y=0;y<=s.rows;y++)PixelTheme.Fill(new Rect(r.x,r.y+y*cell,r.width,1),new Color(.15f,.25f,.32f));}
        private static Rect BlockRect(Rect r,ConstructionSpec s,float cell,BlockPiece b,BlockPlacement p){var w=p.rotation==0?b.width:b.height;var h=p.rotation==0?b.height:b.width;return new Rect(r.x+p.x*cell,r.y+(s.rows-p.y-h)*cell,w*cell,h*cell);}
        private static void DrawBlock(Rect r,ConstructionSpec s,float cell,BlockPiece b,BlockPlacement p,bool selected){var rect=BlockRect(r,s,cell,b,p);int i=Array.IndexOf(s.pieces,b);var color=Color.HSVToRGB((.1f+i*.18f)%1,.6f,.9f);PixelTheme.Fill(rect,selected?Color.white:Color.black);PixelTheme.Fill(new Rect(rect.x+3,rect.y+3,rect.width-6,rect.height-6),color);PixelTheme.Fill(new Rect(rect.x+4,rect.y+4,rect.width-8,Mathf.Min(6*b.depth,rect.height/4)),color*1.2f);GUI.Label(rect,(i+1).ToString());}
    }
}
